from fastapi import FastAPI
from datetime import datetime, timezone
from pydantic import BaseModel, field_validator, ConfigDict
from fastapi.responses import JSONResponse, StreamingResponse
import numpy as np
import joblib

from fastapi import UploadFile, File
from fastapi.responses import JSONResponse
from PIL import Image
import io


# Sub-application
subapi = FastAPI()

# Load the trained model file 
model = joblib.load("model_pipeline.pkl")

class HouseInput(BaseModel):
    MedInc: float #Median Income
    HouseAge: float
    AveRooms: float
    AveBedrms: float
    Population: float
    AveOccup: float
    Latitude: float
    Longitude: float 
    model_config = ConfigDict(extra='forbid')
    
    @field_validator('Latitude', mode='before')
    @classmethod
    def validate_latitude(cls, input):
        if input < -90 or input > 90:
            raise ValueError("Invalid value for Latitude")
        return input

    @field_validator('Longitude', mode='before')
    @classmethod
    def validate_longitude(cls, input):
        if input < -180 or input > 180:
            raise ValueError("Invalid value for Longitude")
        return input


class HousePrediction(BaseModel):
    prediction: float #

#Defines the /health endpoint 
@subapi.get("/health")
async def health():
    current_time = datetime.now(timezone.utc).isoformat() #confirm the timezone
    return {"time": current_time}

#Defines the /hello endpoint
@subapi.get("/hello")
async def hello(name:str):
    
    if not name:
        return JSONResponse(
            status_code=422,
            content={"detail": "Name is missing from the paramater field"},
        )    
    return {"message": f"Hello {name}"}

#Defines the /predict endpoint

@subapi.post("/predict", response_model=HousePrediction)
async def predict(house: HouseInput):
    """
    The endpoint accepts input data and validates it using the House Pydantic model,
    and returns a predicted value.
    """
    
    input_data = [house.MedInc, house.HouseAge, house.AveRooms, house.AveBedrms, house.Population, house.AveOccup, house.Latitude, house.Longitude]
    input_array = np.array(input_data, dtype=np.float32).reshape(1, -1)
    
    if any(value <= 0 for value in input_data[:6]):
        return JSONResponse(
            status_code = 422,
            content = {"detail": "All house inputs excluding Latitude and Longitude must be above zero"}
        )
    
    

    prediction = model.predict(input_array)[0]
    return {'prediction': float(prediction)}


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


# @subapi.post("/check")
# async def check(file: UploadFile = File(...)):
#     """
#     Endpoint to verify that an image file was received, can be opened,
#     and is resized to 640x640 with padding.
#     """
#     try:
#         contents = await file.read()
#         pil_img = Image.open(io.BytesIO(contents)).convert("RGB")

#         width, height = pil_img.size
#         processed_img = resize_with_padding(pil_img, 640)
#         proc_w, proc_h = processed_img.size

#         return {
#             "filename": file.filename,
#             "original_width": width,
#             "original_height": height,
#             "processed_width": proc_w,
#             "processed_height": proc_h,
#             "message": "Image received and resized successfully"
#         }

#     except Exception as e:
#         return JSONResponse(
#             status_code=400,
#             content={"error": f"Invalid image file: {str(e)}"}
#         )

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