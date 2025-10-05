1. Make sure docker engine is running currently and run command "docker build -t mlapi ."
2. After docker image is done building, run command "docker run -p 8000:8000 mlapi"
3. Run on local host on the "http://localhost:8000/freshvision/docs" to test backend apis. There are two available endpoints "predict-banana" and "annotate-banana"

