import React, { useState } from "react";

function DefaultApp() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [originalImageURL, setOriginalImageURL] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [jsonResult, setJsonResult] = useState(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState("check");
  const [loading, setLoading] = useState(false);

  // Reset only processed results when switching endpoints
  const handleEndpointChange = (event) => {
    setSelectedEndpoint(event.target.value);
    setProcessedImage(null);  // Clear processed image
    setJsonResult(null);      // Clear JSON/table
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setOriginalImageURL(URL.createObjectURL(file)); // Store preview
      setProcessedImage(null);
      setJsonResult(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setLoading(true);
    setProcessedImage(null);
    setJsonResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      let endpointUrl = "";
      switch (selectedEndpoint) {
        case "check":
          endpointUrl = "http://127.0.0.1:8000/freshvision/check";
          break;
        case "annotate-banana":
          endpointUrl = "http://127.0.0.1:8000/freshvision/annotate-banana";
          break;
        case "predict-banana":
          endpointUrl = "http://127.0.0.1:8000/freshvision/predict-banana";
          break;
        default:
          return;
      }

      const response = await fetch(endpointUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Request failed");

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("image")) {
        const blob = await response.blob();
        setProcessedImage(URL.createObjectURL(blob));
      } else if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        setJsonResult(data);
      } else {
        console.warn("Unexpected response type:", contentType);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Something went wrong!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "auto", padding: 20, fontFamily: "Arial" }}>
      <h1>Grocery Freshness Test</h1>

      {/* --- Endpoint Selection --- */}
      <div style={{ marginBottom: 20 }}>
        <label>
          <input
            type="radio"
            name="endpoint"
            value="check"
            checked={selectedEndpoint === "check"}
            onChange={handleEndpointChange}
          />
          Check Image (Resize Only)
        </label>
        <label style={{ marginLeft: 15 }}>
          <input
            type="radio"
            name="endpoint"
            value="annotate-banana"
            checked={selectedEndpoint === "annotate-banana"}
            onChange={handleEndpointChange}
          />
          Annotate Image
        </label>
        <label style={{ marginLeft: 15 }}>
          <input
            type="radio"
            name="endpoint"
            value="predict-banana"
            checked={selectedEndpoint === "predict-banana"}
            onChange={handleEndpointChange}
          />
          Predict Classes
        </label>
      </div>

      {/* --- File Upload --- */}
      <input type="file" accept="image/*" onChange={handleFileChange} />
      <button onClick={handleSubmit} disabled={loading} style={{ marginLeft: 10 }}>
        {loading ? "Processing..." : "Run"}
      </button>

      {/* --- Original Uploaded Image --- */}
      {originalImageURL && (
        <div style={{ marginTop: 30 }}>
          <h3>Original Image:</h3>
          <img
            src={originalImageURL}
            alt="Original upload"
            style={{
              maxWidth: "100%",
              marginBottom: 20,
            }}
          />
        </div>
      )}

      {/* --- Processed Image --- */}
      {processedImage && (
        <div style={{ marginTop: 30 }}>
          <h3>Processed Image:</h3>
          <img
            src={processedImage}
            alt="Processed result"
            style={{ maxWidth: "100%"}}
          />
        </div>
      )}

      {/* --- Table Output --- */}
      {jsonResult && (
        <div style={{ marginTop: 30 }}>
          <h3>Prediction:</h3>
          {jsonResult.predictions && jsonResult.predictions.length > 0 && (
            <table
              border="1"
              cellPadding="6"
              style={{
                borderCollapse: "collapse",
                width: "100%",
                marginTop: 10,
              }}
            >
              <thead>
                <tr>
                  <th>Class Name</th>
                  <th>Confidence</th>
                  <th>Bounding Box [x1, y1, x2, y2]</th>
                </tr>
              </thead>
              <tbody>
                {jsonResult.predictions.map((pred, idx) => (
                  <tr key={idx}>
                    <td>{pred.class_name}</td>
                    <td>{(pred.confidence * 100).toFixed(1)}%</td>
                    <td>{pred.bbox.map((x) => x.toFixed(1)).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default DefaultApp;
