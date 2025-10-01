import json
from fastapi import FastAPI
from datetime import datetime, timezone
from pydantic import BaseModel, field_validator, ConfigDict
from fastapi.responses import JSONResponse, StreamingResponse
import numpy as np
import joblib
from ultralytics import YOLO

from fastapi import UploadFile, File
from fastapi.responses import JSONResponse
from PIL import Image
import io
import os

# Sub-application
subapi = FastAPI()

model_path = "./best.pt"
yolo_model = YOLO(model_path)


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

        # Save to in-memory buffer
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
    
# @subapi.post("/predict-banana")
# async def predict_banana(file: UploadFile = File(...)):
#     try:
#         contents = await file.read()
#         pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
#         processed_img = resize_with_padding(pil_img, 640)
#         img_np = np.array(processed_img)

#         # Use the correct YOLO model variable
#         results = yolo_model.predict(img_np, imgsz=640, verbose=False)

#         predictions = []
#         for r in results:
#             for box, cls, conf in zip(r.boxes.xyxy, r.boxes.cls, r.boxes.conf):
#                 predictions.append({
#                     "bbox": [float(x) for x in box.tolist()],
#                     "class": int(cls),
#                     "confidence": float(conf)
#                 })

#         all_predictions_dict = json.loads(results.tojson())

#         return {
#             "filename": file.filename,
#             "num_detections": len(predictions),
#             "predictions": predictions
#         }

#     except Exception as e:
#         return JSONResponse(
#             status_code=400,
#             content={"error": f"Invalid image file or model error: {str(e)}"})

@subapi.post("/predict-banana")
async def predict_banana(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
        #processed_img = resize_with_padding(pil_img, 640)
        #img_np = np.array(processed_img)

        results = yolo_model.predict(pil_img, imgsz=640, conf=0.25, iou=0.6, stream=False)

        predictions = []
        all_predictions_dict = {} 

        if results:
          
            r = results[0]

            for box, cls, conf in zip(r.boxes.xyxy, r.boxes.cls, r.boxes.conf):
                predictions.append({
                    "bbox": [float(x) for x in box.tolist()],
                    "class_id": int(cls),
                    "class_name": r.names[int(cls)],
                    "confidence": float(conf)
                })
            

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




@subapi.post("/predict-banana-image")
async def predict_banana(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
        processed_img = resize_with_padding(pil_img, 640)
        img_np = np.array(processed_img)

    
        results = yolo_model.predict(img_np, imgsz=640, verbose=False)

 
        r = results[0]
        plotted = r.plot()  # returns NumPy array (BGR)
        
        # Convert BGR -> RGB, then to PIL
        plotted_pil = Image.fromarray(plotted)

        img_bytes = io.BytesIO()
        plotted_pil.save(img_bytes, format="JPEG")
        img_bytes.seek(0)

        return StreamingResponse(img_bytes, media_type="image/jpeg")

    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid image file or model error: {str(e)}"}
        )