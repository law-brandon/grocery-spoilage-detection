import React, { useState, useEffect } from 'react';
import './ImageGallery.css';

const ImageGallery = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextToken, setNextToken] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [dateFilter, setDateFilter] = useState({ from: null, to: null });
  const [typeFilter, setTypeFilter] = useState('all');

  const API_BASE = "http://freshvision-940640548.us-east-1.elb.amazonaws.com/freshvision";

  const fetchImages = async (token = null) => {
    try {
      setLoading(true);
      let url = `${API_BASE}/images?page_size=12`;
      if (token) url += `&next_token=${token}`;
      if (dateFilter.from) url += `&date_from=${dateFilter.from}`;
      if (dateFilter.to) url += `&date_to=${dateFilter.to}`;
      if (typeFilter !== 'all') url += `&filter_type=${typeFilter}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch images');
      
      const data = await response.json();
      setImages(prev => token ? [...prev, ...data.images] : data.images);
      setNextToken(data.next_token);
      setHasMore(!!data.next_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [dateFilter, typeFilter]);

  const loadMore = () => {
    if (nextToken) {
      fetchImages(nextToken);
    }
  };

  const handleFilterChange = (type) => {
    setTypeFilter(type);
    setImages([]);
    setNextToken(null);
  };

  const handleDateChange = (type, date) => {
    setDateFilter(prev => ({ ...prev, [type]: date }));
    setImages([]);
    setNextToken(null);
  };

  return (
    <div className="gallery-container">
      <div className="gallery-filters">
        <div className="filter-group">
          <select 
            value={typeFilter} 
            onChange={(e) => handleFilterChange(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Images</option>
            <option value="fresh">Fresh Only</option>
            <option value="spoiled">Spoiled Only</option>
          </select>
        </div>
        <div className="filter-group">
          <input
            type="date"
            onChange={(e) => handleDateChange('from', e.target.value)}
            className="date-filter"
          />
          <span>to</span>
          <input
            type="date"
            onChange={(e) => handleDateChange('to', e.target.value)}
            className="date-filter"
          />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      
      <div className="image-grid">
        {images.map((image, index) => (
          <div key={index} className="image-card">
            <img src={image.url} alt={image.original_filename} loading="lazy" />
            <div className="image-info">
              <p className="image-name">{image.original_filename}</p>
              <p className="upload-date">
                {new Date(image.upload_timestamp).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {loading && <div className="loading">Loading...</div>}
      
      {hasMore && !loading && (
        <button onClick={loadMore} className="load-more-btn">
          Load More
        </button>
      )}
    </div>
  );
};

export default ImageGallery;