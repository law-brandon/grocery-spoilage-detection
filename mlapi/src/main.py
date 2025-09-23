#Import statements
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from .housing_predict import subapi

#Initializes instace of the FastAPI class
app = FastAPI()

# Mount the sub-application
app.mount("/lab", subapi)
