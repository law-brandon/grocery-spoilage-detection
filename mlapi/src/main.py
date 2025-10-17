#Import statements
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .banana_predict import subapi

#Initializes instace of the FastAPI class
app = FastAPI()

# Allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, set your frontend URL here
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the sub-application
app.mount("/freshvision", subapi)

@subapi.get("/")
async def health_check():
    """
    A simple health check endpoint that returns 200 OK.
    The Load Balancer will hit this path to check if the service is alive.
    """
    return {"status": "ok"}
