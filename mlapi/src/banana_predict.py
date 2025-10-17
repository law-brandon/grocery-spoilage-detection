import json
from fastapi import FastAPI, UploadFile, File
from datetime import datetime, timezone, timedelta
from fastapi.responses import JSONResponse, StreamingResponse
import numpy as np
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


#Defines the /health endpoint 
@subapi.get("/health")
async def health():
    current_time = datetime.now(timezone.utc).isoformat() #confirm the timezone
    return {"time": current_time}

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
        all_predictions_dict = {} 
        
        # Generate timestamp and S3 keys
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        base_name = os.path.splitext(file.filename)[0]
        annotated_key = f"annotated/{timestamp}_{base_name}_annotated.png"

        if results:
          
            r = results[0]

            for box, cls, conf in zip(r.boxes.xyxy, r.boxes.cls, r.boxes.conf):
                predictions.append({
                    "bbox": [float(x) for x in box.tolist()],
                    "class_id": int(cls),
                    "class_name": r.names[int(cls)],
                    "confidence": float(conf)
                })
            
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

        return {
            "filename": file.filename,
            "num_detections": len(predictions),
            "predictions": predictions
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