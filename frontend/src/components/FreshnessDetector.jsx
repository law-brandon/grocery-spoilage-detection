import React, { useState, useRef, useEffect } from 'react';
import './FreshnessDetector.css';

const FreshnessDetector = () => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [detections, setDetections] = useState([]);
  const [stats, setStats] = useState({ fresh: 0, spoiled: 0 });
  const [selectedFile, setSelectedFile] = useState(null);

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const uploadedImageSrc = useRef(null);

  // API endpoint base URL
  const API_BASE = "http://freshvision-940640548.us-east-1.elb.amazonaws.com/freshvision";

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setSelectedFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImageSrc.current = e.target.result;
      setImageLoaded(true);
      setShowResults(false);
      setDetections([]);
      setStats({ fresh: 0, spoiled: 0 });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (imageLoaded && imageRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = imageRef.current.offsetWidth;
      canvas.height = imageRef.current.offsetHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [imageLoaded]);

  const analyzeImage = async () => {
    if (!selectedFile) {
      alert('Please upload an image first!');
      return;
    }

    setAnalyzing(true);
    
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // Call the predict-banana endpoint
      const response = await fetch(`${API_BASE}/predict-banana`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Request failed');

      const data = await response.json();
      
      if (data.predictions && data.predictions.length > 0) {
        // Process predictions into our format
        const processedDetections = data.predictions.map(pred => ({
          name: pred.class_name,
          status: pred.class_name.toLowerCase().includes('ripe') || 
                  pred.class_name.toLowerCase().includes('fresh') ? 'fresh' : 'spoiled',
          confidence: Math.round(pred.confidence * 100),
          bbox: pred.bbox // [x1, y1, x2, y2]
        }));

        setDetections(processedDetections);
        drawBoundingBoxes(processedDetections);
        
        // Calculate stats
        const fresh = processedDetections.filter(d => d.status === 'fresh').length;
        const spoiled = processedDetections.filter(d => d.status === 'spoiled').length;
        setStats({ fresh, spoiled });
        
        setShowResults(true);
      } else {
        alert('No produce detected in the image');
        setDetections([]);
        setStats({ fresh: 0, spoiled: 0 });
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to analyze image. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const drawBoundingBoxes = (predictions) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / image.naturalWidth;
    const scaleY = canvas.height / image.naturalHeight;

    predictions.forEach((detection) => {
      // bbox format: [x1, y1, x2, y2]
      const [x1, y1, x2, y2] = detection.bbox;
      
      const x = x1 * scaleX;
      const y = y1 * scaleY;
      const width = (x2 - x1) * scaleX;
      const height = (y2 - y1) * scaleY;

      const color = detection.status === 'fresh' ? '#10b981' : '#ef4444';
      
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      ctx.shadowBlur = 0;

      ctx.fillStyle = color;
      const label = `${detection.name}`;
      ctx.font = 'bold 14px -apple-system, sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(x, y - 28, textWidth + 16, 28);

      ctx.fillStyle = 'white';
      ctx.fillText(label, x + 8, y - 9);
    });
  };

  const handleReset = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setImageLoaded(false);
    setShowResults(false);
    setDetections([]);
    setStats({ fresh: 0, spoiled: 0 });
    setSelectedFile(null);
    uploadedImageSrc.current = null;
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  return (
    <div className="freshness-container">
      <div className="header">
        <img src="/freshvision-logo.png" alt="FreshVision Logo" className="logo" />
        <p>Instantly assess produce freshness, automatically identifies spoilage on fruits and vegetables</p>
      </div>

      <div className={`main-content ${!showResults ? 'initial-state' : ''}`}>
        <div className="card upload-section">
          {!imageLoaded ? (
            <div 
              className="upload-area" 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="upload-icon">📸</div>
              <div className="upload-text">Drop your image here</div>
              <div className="upload-subtext">or click to browse • JPG, PNG, GIF up to 10MB</div>
              <input 
                type="file" 
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
              <button className="btn" onClick={() => fileInputRef.current?.click()}>
                Select Image
              </button>
            </div>
          ) : (
            <div className="image-container active">
              <img 
                ref={imageRef}
                src={uploadedImageSrc.current} 
                alt="Uploaded" 
                id="uploadedImage"
              />
              <canvas ref={canvasRef} className="canvas-overlay"></canvas>
            </div>
          )}

          {imageLoaded && (
            <div className="button-group">
              <button 
                className="btn analyze-btn active" 
                onClick={analyzeImage}
                disabled={analyzing}
              >
                🔍 {analyzing ? 'Analyzing...' : 'Analyze Now'}
              </button>
              <button className="btn reset-btn active" onClick={handleReset}>
                🔄 New Scan
              </button>
            </div>
          )}

          {analyzing && (
            <div className="loading active">
              <div className="spinner"></div>
              <p>Analyzing freshness...</p>
            </div>
          )}
        </div>

        <div className={`card results ${showResults ? 'active' : ''}`}>
          <h2 className="results-title">Analysis Results</h2>
          
          {showResults && detections.length > 0 && (
            <div className="stats-bar" style={{ display: 'flex' }}>
              <div className="stat-card">
                <div className="stat-value">{stats.fresh}</div>
                <div className="stat-label">Fresh</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.spoiled}</div>
                <div className="stat-label">Spoiled</div>
              </div>
            </div>
          )}

          <div className="results-list">
            {detections.map((detection, index) => (
              <div 
                key={index} 
                className={`result-item ${detection.status}`}
                style={{ animationDelay: `${(index + 1) * 0.1}s` }}
              >
                <div className="result-info">
                  <div className="result-name">{detection.name}</div>
                  <div className="result-confidence">Confidence: {detection.confidence}%</div>
                </div>
                <span className={`result-status status-${detection.status}`}>
                  {detection.status === 'fresh' ? '✓ Fresh' : '✗ Spoiled'}
                </span>
              </div>
            ))}
          </div>

          {showResults && detections.length === 0 && (
            <div style={{ color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', padding: '20px' }}>
              No produce detected in the image. Try another image!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FreshnessDetector;