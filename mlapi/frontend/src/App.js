import React, { useState } from "react";

function DefaultApp() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [jsonResult, setJsonResult] = useState(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState("check");
  const [loading, setLoading] = useState(false);

  // Reset state when changing endpoints
  const handleEndpointChange = (event) => {
    setSelectedEndpoint(event.target.value);
    setProcessedImage(null);  // clear the image
    setJsonResult(null);      // clear the json/table
  };

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
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
    <div style={{ maxWidth: 800, margin: "auto", padding: 20, fontFamily: "Arial", textAlign: "center" }}>
      <h1>Grocery Freshness Test</h1>

      {/* --- File Upload --- */}
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleFileChange}
        style={{ margin: "20px 0" }} />

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
          Check Image
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
          Predict Class and Confidence
        </label>
      </div>
      
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? "Processing..." : "Submit"}
      </button>

      {/* --- Image Output --- */}
      {processedImage && (
        <div style={{ marginTop: 30 }}>
          <h3>Processed Image:</h3>
          <img
            src={processedImage}
            alt="Processed result"
            style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>
      )}

      {/* --- JSON/Table Output --- */}
      {jsonResult && (
        <div style={{ marginTop: 30 }}>
          
          {jsonResult.predictions && jsonResult.predictions.length > 0 && (
            <table
              border="1"
              cellPadding="6"
              style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}
            >
              <thead>
                <tr style={{ background: "#ddd" }}>
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
