import json
from fastapi import FastAPI, UploadFile, File, Query
from datetime import datetime, timezone, timedelta
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import numpy as np
import psycopg2
from ultralytics import YOLO
from PIL import Image
import io
import os
from dotenv import load_dotenv

import boto3
from botocore.exceptions import ClientError
import uuid
from typing import Optional, Tuple, List

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'port': os.getenv('DB_PORT', '5432')
}

# Sub-application
subapi = FastAPI()

model_path = "./best.pt"
yolo_model = YOLO(model_path)

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "freshvision-s3-prediction-store-test")

# Configure AWS S3 Client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
) if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY else boto3.client('s3')

# Allowed image extensions
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_image_file(filename: str, content: bytes) -> tuple[bool, Optional[str]]:
    """Validate image file extension and size."""
    # Check extension
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
    
    # Check size
    if len(content) > MAX_FILE_SIZE:
        return False, f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024*1024)}MB"
    
    return True, None

def generate_s3_key(filename: str, folder: str = "uploads") -> str:
    """Generate a unique S3 key for the file."""
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    unique_id = str(uuid.uuid4())[:8]
    ext = os.path.splitext(filename)[1]
    return f"{folder}/{timestamp}_{unique_id}{ext}"

@subapi.get("/time_series_spoilage")
async def test_db():
    """
    Query entries grouped by week and fruit, calculating spoilage percentages.
    """
    try:
        # Connect to the database
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        # Query entries grouped by week and fruit with spoilage calculations
        cur.execute("""
            WITH weekly_stats AS (
                SELECT 
                    DATE_TRUNC('week', created_at) as week,
                    fruit,
                    COUNT(*) as total_count,
                    COUNT(*) FILTER (WHERE NOT is_fresh) as spoiled_count
                FROM entries 
                GROUP BY DATE_TRUNC('week', created_at), fruit
                ORDER BY week DESC, fruit
            )
            SELECT 
                week,
                fruit,
                total_count,
                spoiled_count,
                ROUND((spoiled_count::float / total_count * 100)::numeric, 2) as spoilage_percentage
            FROM weekly_stats;
        """)
        rows = cur.fetchall()
        
        # Convert to list of dictionaries with formatted dates
        weekly_stats = [
            {
                "week_starting": row[0].isoformat(),
                "fruit": row[1],
                "total_samples": row[2],
                "spoiled_samples": row[3],
                "spoilage_percentage": float(row[4])
            }
            for row in rows
        ]
        
        # Close connections
        cur.close()
        conn.close()
        
        return {
            "total_weeks": len(set(stat["week_starting"] for stat in weekly_stats)),
            "weekly_statistics": weekly_stats
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Database connection failed",
                "error": str(e),
                "config": {
                    "host": DB_CONFIG["host"],
                    "port": DB_CONFIG["port"],
                    "dbname": DB_CONFIG["dbname"],
                    "user": DB_CONFIG["user"],
                    "sslmode": "require"
                    # Not including password for security
                }
            }
        )


#Defines the /health endpoint 
@subapi.get("/health")
async def health():
    current_time = datetime.now(timezone.utc).isoformat()
    
    # Check S3 connectivity
    s3_status = "healthy"
    s3_error = None
    try:
        s3_client.head_bucket(Bucket=S3_BUCKET_NAME)
        # Try to list objects to verify permissions
        response = s3_client.list_objects_v2(Bucket=S3_BUCKET_NAME, MaxKeys=1)
        object_count = response.get('KeyCount', 0)
    except Exception as e:
        s3_status = "unhealthy"
        s3_error = str(e)
    
    return {
        "time": current_time,
        "s3_status": s3_status,
        "s3_error": s3_error,
        "s3_bucket": S3_BUCKET_NAME,
        "aws_region": AWS_REGION
    }

def resize_with_padding(image: Image.Image, target_size: int = 640) -> Image.Image:
    """
    Resizes an image to fit inside target_size x target_size while keeping
    aspect ratio, adding black padding as needed (similar to YOLO letterbox).
    """
    # Scale image while maintaining aspect ratio
    ratio = min(target_size / image.width, target_size / image.height)
    new_w = int(image.width * ratio)
    new_h = int(image.height * ratio)
    resized = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Create new canvas and paste resized image centered
    new_img = Image.new("RGB", (target_size, target_size), (0, 0, 0))
    paste_x = (target_size - new_w) // 2
    paste_y = (target_size - new_h) // 2
    new_img.paste(resized, (paste_x, paste_y))
    return new_img


@subapi.post("/check")
async def check(file: UploadFile = File(...)):
    """
    Endpoint to verify an image was received, resize it to 640x640 with padding,
    and return it as a downloadable file.
    """
    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
        processed_img = resize_with_padding(pil_img, 640)

        buf = io.BytesIO()
        processed_img.save(buf, format="JPEG")
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="image/jpeg",
            headers={"Content-Disposition": f"attachment; filename=processed_{file.filename}"}
        )

    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid image file: {str(e)}"}
        )
    

@subapi.post("/predict-banana")
async def predict_banana(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")

        results = yolo_model.predict(pil_img, imgsz=640, conf=0.25, iou=0.6, stream=False)

        predictions = []
        is_fresh = True  # Default to fresh unless spoiled is detected
        
        # Generate timestamp and S3 keys
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        base_name = os.path.splitext(file.filename)[0]
        annotated_key = f"annotated/{timestamp}_{base_name}_annotated.png"

        if results:
            r = results[0]

            for box, cls, conf in zip(r.boxes.xyxy, r.boxes.cls, r.boxes.conf):
                class_name = r.names[int(cls)]
                predictions.append({
                    "bbox": [float(x) for x in box.tolist()],
                    "class_id": int(cls),
                    "class_name": class_name,
                    "confidence": float(conf)
                })
                # If any prediction is "spoiled", mark the banana as not fresh
                if "spoiled" in class_name.lower():
                    is_fresh = False
            
            annotated_array = r.plot()
            annotated_array = annotated_array[..., ::-1]
            annotated_image = Image.fromarray(annotated_array)
            img_byte_arr = io.BytesIO()
            annotated_image.save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)

            s3_key = generate_s3_key(file.filename, "uploads")
        
            # Upload to S3
            s3_client.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=s3_key,
                Body=img_byte_arr.getvalue(),
                ContentType='image/jpeg',
                Metadata={
                    'original_filename': file.filename,
                    'upload_timestamp': datetime.utcnow().isoformat()
                }
            )

            # Store predictions in database
            try:
                conn = psycopg2.connect(**DB_CONFIG)
                cur = conn.cursor()
                
                # Insert an entry for each prediction
                for prediction in predictions:

                    current_class_name = prediction["class_name"].lower()
                    is_fresh_for_this_item = current_class_name not in (
                    "rotten banana", "rotten apple", "rotten strawberry"
                    )

                    sql_query = """
                    INSERT INTO entries (created_at, fruit, is_fresh)
                    VALUES (NOW(), %s, %s) 
                    RETURNING id;
                    """
                    cur.execute(sql_query, (prediction["class_name"], is_fresh_for_this_item))
                
                conn.commit()
                cur.close()
                conn.close()
                
            except Exception as db_error:
                print(f"Database error: {str(db_error)}")
                # Continue even if database insert fails
                pass

        return {
            "filename": file.filename,
            "num_detections": len(predictions),
            "predictions": predictions,
            "is_fresh": is_fresh
        }

    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid image file or model error: {str(e)}"}
        )

@subapi.post("/annotate-banana")
async def predict_banana(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents))    
        results = yolo_model.predict(pil_img, imgsz=640, verbose=False)

 
        r = results[0]
        plotted = r.plot()
        
        plotted_rgb = plotted[..., ::-1]
        plotted_pil = Image.fromarray(plotted_rgb)

        img_bytes = io.BytesIO()
        plotted_pil.save(img_bytes, format="JPEG")
        img_bytes.seek(0)

        return StreamingResponse(img_bytes, media_type="image/jpeg")

    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid image file or model error: {str(e)}"}
        )


# 3. Upload Endpoint
@subapi.post("/upload-image")
async def upload_image_to_s3(
    file: UploadFile = File(...),
    folder: str = "uploads"
):
    """
    Upload an image to S3 bucket.
    
    Args:
        file: Image file to upload
        folder: S3 folder/prefix (default: "uploads")
    
    Returns:
        JSON with S3 URL and metadata
    """
    try:
        # Read file contents
        contents = await file.read()
        
        # Validate file
        is_valid, error_msg = validate_image_file(file.filename, contents)
        if not is_valid:
            return JSONResponse(
                status_code=400,
                content={"error": error_msg}
            )
        
        # Generate unique S3 key
        s3_key = generate_s3_key(file.filename, folder)
        
        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=contents,
            ContentType=file.content_type or 'image/jpeg',
            Metadata={
                'original_filename': file.filename,
                'upload_timestamp': datetime.utcnow().isoformat()
            }
        )
        
        # Generate S3 URL
        s3_url = f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        
        return {
            "success": True,
            "filename": file.filename,
            "s3_key": s3_key,
            "s3_url": s3_url,
            "size_bytes": len(contents),
            "content_type": file.content_type
        }
    
    except ClientError as e:
        error_code = e.response['Error']['Code']
        return JSONResponse(
            status_code=500,
            content={"error": f"S3 upload failed: {error_code} - {str(e)}"}
        )
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Upload failed: {str(e)}"}
        )

# Add these models at the top of your file
class ImageMetadata(BaseModel):
    key: str
    url: str
    upload_timestamp: str
    original_filename: str
    predictions: Optional[List[dict]] = None

class ImageListResponse(BaseModel):
    images: List[ImageMetadata]
    next_token: Optional[str] = None
    total_count: int

@subapi.get("/images", response_model=ImageListResponse)
async def list_images(
    page_size: int = Query(default=20, ge=1, le=100),
    next_token: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    filter_type: Optional[str] = Query(None, enum=['fresh', 'spoiled', 'all'])
):
    """
    Get a paginated list of uploaded images with their metadata.
    
    Args:
        page_size: Number of images per page (1-100)
        next_token: Token for pagination
        date_from: Filter images from this date (YYYY-MM-DD)
        date_to: Filter images to this date (YYYY-MM-DD)
        filter_type: Filter by prediction type (fresh/spoiled/all)
    """
    try:
        # Parse date filters
        date_from_obj = datetime.strptime(date_from, '%Y-%m-%d') if date_from else None
        date_to_obj = datetime.strptime(date_to, '%Y-%m-%d') if date_to else None
        
        # Set up paginator
        paginator = s3_client.get_paginator('list_objects_v2')
        
        # Configure pagination parameters
        pagination_config = {
            'PageSize': page_size,
            'StartingToken': next_token,
            'MaxItems': page_size
        }
        
        # List objects with prefix for annotations
        page_iterator = paginator.paginate(
            Bucket=S3_BUCKET_NAME,
            PaginationConfig=pagination_config
        )
        
        images = []
        total_count = 0
        
        for page in page_iterator:
            if 'Contents' not in page:
                continue
                
            for obj in page['Contents']:
                # Get object metadata
                try:
                    metadata = s3_client.head_object(
                        Bucket=S3_BUCKET_NAME,
                        Key=obj['Key']
                    )
                    
                    # Parse timestamp from metadata
                    upload_timestamp = metadata.get('Metadata', {}).get(
                        'upload_timestamp', 
                        obj['LastModified'].isoformat()
                    )
                    
                    # Apply date filter if specified
                    if date_from_obj or date_to_obj:
                        upload_date = datetime.fromisoformat(upload_timestamp)
                        if (date_from_obj and upload_date < date_from_obj) or \
                           (date_to_obj and upload_date > date_to_obj):
                            continue
                    
                    # Generate presigned URL (valid for 1 hour)
                    url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={
                            'Bucket': S3_BUCKET_NAME,
                            'Key': obj['Key']
                        },
                        ExpiresIn=3600
                    )
                    
                    # Create image metadata object
                    image_data = ImageMetadata(
                        key=obj['Key'],
                        url=url,
                        upload_timestamp=upload_timestamp,
                        original_filename=metadata.get('Metadata', {}).get('original_filename', ''),
                        predictions=metadata.get('Metadata', {}).get('predictions', None)
                    )
                    
                    # Apply prediction type filter if specified
                    if filter_type and filter_type != 'all':
                        predictions = image_data.predictions
                        if not predictions:
                            continue
                        
                        has_matching_prediction = any(
                            p['class_name'].lower().startswith(filter_type.lower())
                            for p in predictions
                        )
                        if not has_matching_prediction:
                            continue
                    
                    images.append(image_data)
                    total_count += 1
                    
                except ClientError:
                    continue
            
            # Get next token for pagination
            next_token = page.get('NextToken')
        
        return ImageListResponse(
            images=images,
            next_token=next_token,
            total_count=total_count
        )
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to list images: {str(e)}"}
        )
