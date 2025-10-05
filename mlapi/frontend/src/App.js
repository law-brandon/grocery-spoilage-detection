import React, { useState } from "react";

function DefaultApp() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [processedUrl, setProcessedUrl] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Triggered when user picks a file
  const BaseFunction = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setProcessedUrl(""); // Clear old result
    setPreviewUrl(URL.createObjectURL(file)); // Show preview immediately

    // Automatically send the file to /freshvision/check
    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/freshvision/check", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process image");
      }

      // Response is an image blob, not JSON
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      setProcessedUrl(imageUrl);
    } catch (error) {
      console.error("Error:", error);
      alert("Something went wrong while processing the image.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "40px" }}>
      <h1>Grocery Freshness Test</h1>

      <input
        type="file"
        accept="image/*"
        onChange={BaseFunction}
        style={{ marginTop: "20px" }}
      />

      {previewUrl && (
        <div style={{ marginTop: "30px" }}>
          <h3>Original Image:</h3>
          <img
            src={previewUrl}
            alt="Original"
            style={{ width: 300, borderRadius: 10 }}
          />
        </div>
      )}

      {loading && <p>Processing image...</p>}

      {processedUrl && (
        <div style={{ marginTop: "30px" }}>
          <h3>Processed Image:</h3>
          <img
            src={processedUrl}
            alt="Processed"
            style={{ width: 300, borderRadius: 10 }}
          />
          <div style={{ marginTop: "10px" }}>
            <a href={processedUrl} download="processed_image.jpg">
              Download Processed Image
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default DefaultApp;
