import React, { useState, useEffect, useRef } from "react";

function ImageUploader() {
  // State Variables
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resizedImageUrl, setResizedImageUrl] = useState(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState(null);
  const [lastUploadedKey, setLastUploadedKey] = useState(null);
  const [quality, setQuality] = useState(85);
  const [width, setWidth] = useState(128);
  const [height, setHeight] = useState(128);

  // Refs for polling and file input
  const pollingIntervalRef = useRef(null);
  const pollingAttemptsRef = useRef(0);
  const fileInputRef = useRef(null);

  // Configuration Constants
  const outputBucketName = "vyomuchat-image-resizer-output"; 
  const region = "eu-north-1"; 
  const outputFormat = "jpeg";
  const API_BASE_URL =
    "https://13rp2fscr2.execute-api.eu-north-1.amazonaws.com/api"; // Replace with your API Gateway Invoke URL base
  const pollingIntervalMs = 2000;
  const maxPollingAttempts = 15;

  // Stop the polling interval
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      pollingAttemptsRef.current = 0;
      console.log("Polling stopped.");
    }
  };

  // Handle file selection from input
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus(`Selected: ${file.name}`);
      setResizedImageUrl(null); // Clear previous result
      setLastUploadedKey(null); // Clear previous key
      setIsLoading(false); // Reset loading state
      stopPolling(); // Stop any previous polling

      // --- Generate preview for the selected file ---
      setOriginalPreviewUrl(null); // Clear previous original preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginalPreviewUrl(reader.result); // Set the preview URL
      };
      reader.onerror = () => {
        console.error("Error reading file for preview.");
        setUploadStatus("Error generating preview.");
      };
      reader.readAsDataURL(file);
      // --- End of preview generation ---
    } else {
      // Clear states if no file is selected
      setOriginalPreviewUrl(null);
      setSelectedFile(null);
      setUploadStatus("");
    }
  };

  // Update quality state, ensuring it's within 1-100
  const handleQualityChange = (newQuality) => {
    const numQuality = Math.max(1, Math.min(100, Number(newQuality)));
    setQuality(isNaN(numQuality) ? 85 : numQuality);
  };

  // Update dimension state (width/height), ensuring positive integers
  const handleDimensionChange = (value, type) => {
    const numValue = Math.max(1, Number(value));
    const finalValue = isNaN(numValue) || numValue === 0 ? 128 : numValue;
    if (type === "width") {
      setWidth(finalValue);
    } else if (type === "height") {
      setHeight(finalValue);
    }
  };

  // Increment/Decrement quality via buttons
  const incrementQuality = () => {
    handleQualityChange(quality + 1);
  };
  const decrementQuality = () => {
    handleQualityChange(quality - 1);
  };

  // Construct the expected output S3 key based on the input key format
  const getOutputKey = (baseKey) => {
    const prefixMatch = baseKey.match(/^(q\d+_w\d+_h\d+)\/(.*)/);
    if (prefixMatch) {
      const prefixPart = prefixMatch[1];
      const filenamePart = prefixMatch[2];
      const baseName =
        filenamePart.substring(0, filenamePart.lastIndexOf(".")) ||
        filenamePart;
      const extension = outputFormat.toLowerCase();
      return `resized-${prefixPart}/${baseName}.${extension}`;
    }

    const oldPrefixMatch = baseKey.match(/^(quality\d+)\/(.*)/);
    if (oldPrefixMatch) {
      console.warn(
        "Detected old key format, generating compatible output key."
      );
      const filenamePart = oldPrefixMatch[2];
      const baseName =
        filenamePart.substring(0, filenamePart.lastIndexOf(".")) ||
        filenamePart;
      const extension = outputFormat.toLowerCase();
      return `resized-${oldPrefixMatch[1]}/${baseName}.${extension}`;
    }

    console.error("Could not parse prefix from base key:", baseKey);
    return `resized-unknown/${baseKey}`;
  };

  // Extract original filename from the structured key
  const getOriginalFilenameFromKey = (key) => {
    if (!key) return `resized_image.${outputFormat.toLowerCase()}`;
    const parts = key.split("/");
    return parts.length > 1
      ? parts[parts.length - 1]
      : `resized_${key}.${outputFormat.toLowerCase()}`;
  };

  // Function to handle the download button click
  const handleDownloadClick = async () => {
    if (!resizedImageUrl) return;
    setUploadStatus("Preparing download...");
    try {
      const response = await fetch(`${resizedImageUrl}?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image for download: ${response.statusText}`
        );
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const originalFilename = getOriginalFilenameFromKey(lastUploadedKey);
      const baseName =
        originalFilename.substring(0, originalFilename.lastIndexOf(".")) ||
        originalFilename;
      link.setAttribute(
        "download",
        `resized_${baseName}.${outputFormat.toLowerCase()}`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setUploadStatus("Download started.");
    } catch (error) {
      console.error("Download error:", error);
      setUploadStatus(`Error preparing download: ${error.message}`);
    }
  };

  // Handle the image upload process
  const handleUpload = async () => {
    const fileToUpload = selectedFile;
    if (!fileToUpload) {
      setUploadStatus("Please select a file first.");
      return;
    }

    setIsLoading(true);
    setResizedImageUrl(null); // Keep original preview, clear resized one
    setUploadStatus("Getting upload URL...");
    setLastUploadedKey(null);
    stopPolling();

    try {
      const contentType = fileToUpload.type || "application/octet-stream";
      // ** Important: Ensure your generate-presigned-url Lambda function is updated **
      // ** to include width and height in the key generation logic if needed. **
      // ** Example key: q85_w128_h128/myphoto.jpg **
      const apiUrl = `${API_BASE_URL}/get-upload-url?fileName=${encodeURIComponent(
        fileToUpload.name
      )}&quality=${quality}&width=${width}&height=${height}&contentType=${encodeURIComponent(
        contentType
      )}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        throw new Error(
          `Failed to get upload URL: ${
            errorData.error || response.statusText
          } (${response.status})`
        );
      }
      const { uploadUrl, key } = await response.json();

      setUploadStatus("Uploading image...");
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: fileToUpload,
        headers: { "Content-Type": contentType },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("S3 Upload Error Response:", errorText);
        throw new Error(
          `Upload failed: ${uploadResponse.statusText} (${uploadResponse.status})`
        );
      }

      setUploadStatus(`Upload successful! Waiting for resized version...`);
      setLastUploadedKey(key);
      setSelectedFile(null); // Clear selection state after starting upload
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      // setIsLoading remains true while polling
    } catch (error) {
      console.error("Error during upload:", error);
      setUploadStatus(`Error: ${error.message}`);
      setIsLoading(false);
      setLastUploadedKey(null);
      // Don't clear originalPreviewUrl on upload error
      stopPolling();
    }
  };

  // --- useEffect for Polling ---
  useEffect(() => {
    stopPolling(); // Stop previous polling

    if (lastUploadedKey) {
      const outputKey = getOutputKey(lastUploadedKey);
      const publicUrl = `https://${outputBucketName}.s3.${region}.amazonaws.com/${outputKey}`;

      console.log("Starting polling for expected output key:", outputKey);
      console.log("Polling URL:", publicUrl);
      pollingAttemptsRef.current = 0;

      pollingIntervalRef.current = setInterval(async () => {
        pollingAttemptsRef.current += 1;
        console.log(
          `Polling attempt #${pollingAttemptsRef.current} for ${outputKey}`
        );

        if (pollingAttemptsRef.current > maxPollingAttempts) {
          console.error("Polling timed out for:", publicUrl);
          setUploadStatus("Image processing timed out. Please try again.");
          setIsLoading(false);
          stopPolling();
          return;
        }

        try {
          const headResponse = await fetch(`${publicUrl}?t=${Date.now()}`, {
            method: "HEAD",
            cache: "no-store",
          });

          if (headResponse.ok) {
            console.log("Polling successful! Image found at:", publicUrl);
            stopPolling();
            setResizedImageUrl(`${publicUrl}?t=${Date.now()}`);
            setUploadStatus("Resized image loaded.");
            setIsLoading(false);
          } else if (
            headResponse.status === 403 ||
            headResponse.status === 404
          ) {
            console.log(
              `Polling attempt failed with status: ${headResponse.status} (Image not ready yet?)`
            );
          } else {
            console.warn(
              `Polling attempt failed with status: ${headResponse.status}. Will keep trying.`
            );
          }
        } catch (error) {
          console.error("Polling network error:", error);
        }
      }, pollingIntervalMs);
    }

    return () => {
      stopPolling();
    }; // Cleanup on unmount or key change
  }, [lastUploadedKey, outputBucketName, region]); // Dependencies

  // Trigger the hidden file input
  const handleSelectImageClick = () => {
    fileInputRef.current?.click();
  };

  // --- Render Logic ---
  return (
    <div className="image-uploader-box">
      <input
        type="file"
        accept="image/jpeg, image/png, image/gif, image/webp"
        onChange={handleFileChange}
        ref={fileInputRef}
        style={{ display: "none" }}
        disabled={isLoading}
      />

      {/* Show "Select Image" button only when no file is selected/processing/shown */}
      {!selectedFile &&
        !isLoading &&
        !resizedImageUrl &&
        !originalPreviewUrl && (
          <button
            className="select-image-button"
            onClick={handleSelectImageClick}
            disabled={isLoading}
          >
            🖼️ Select Image
          </button>
        )}

      {/* Show initial preview right after selection */}
      {originalPreviewUrl && !isLoading && !resizedImageUrl && selectedFile && (
        <div className="original-preview" style={{ marginBottom: "20px" }}>
          <h3>Preview:</h3>
          <img
            src={originalPreviewUrl}
            alt="Selected Preview"
            style={{
              maxWidth: "300px",
              maxHeight: "300px",
              border: "1px solid #eee",
              borderRadius: "4px",
            }}
          />
        </div>
      )}

      {/* Show controls and status/results area */}
      {(selectedFile || isLoading || resizedImageUrl || originalPreviewUrl) && (
        <div className="controls-and-status">
          {/* Show controls only when a file is selected and not loading/finished */}
          {!isLoading && !resizedImageUrl && selectedFile && (
            <>
              {/* Quality Controls */}
              <div className="quality-control">
                <label htmlFor="qualityInput">Quality (%): </label>
                <button
                  onClick={decrementQuality}
                  disabled={isLoading || quality <= 1}
                >
                  -
                </button>
                <input
                  type="number"
                  id="qualityInput"
                  min="1"
                  max="100"
                  value={quality}
                  onChange={(e) => handleQualityChange(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  onClick={incrementQuality}
                  disabled={isLoading || quality >= 100}
                >
                  +
                </button>
              </div>

              {/* Dimension Controls */}
              <div className="dimension-control">
                <label htmlFor="widthInput">Max Width: </label>
                <input
                  type="number"
                  id="widthInput"
                  min="1"
                  value={width}
                  onChange={(e) =>
                    handleDimensionChange(e.target.value, "width")
                  }
                  disabled={isLoading}
                />
                <label htmlFor="heightInput">Max Height: </label>
                <input
                  type="number"
                  id="heightInput"
                  min="1"
                  value={height}
                  onChange={(e) =>
                    handleDimensionChange(e.target.value, "height")
                  }
                  disabled={isLoading}
                />
              </div>

              {/* Upload Button */}
              <button
                className="upload-button"
                onClick={handleUpload}
                disabled={!selectedFile || isLoading}
              >
                Upload & Resize Image
              </button>
            </>
          )}

          {/* Status Message Area */}
          {uploadStatus && <p className="status">{uploadStatus}</p>}

          {/* Loading Indicator during processing */}
          {isLoading && !resizedImageUrl && (
            <p className="status">Processing, please wait...</p>
          )}

          {/* Result Area with Side-by-Side Comparison */}
          {resizedImageUrl && originalPreviewUrl && (
            <div className="result comparison-container">
              <div className="image-container">
                <h3>Original:</h3>
                <img
                  src={originalPreviewUrl}
                  alt="Original Preview"
                  style={{ maxWidth: "100%", maxHeight: "250px" }} // Style as needed
                />
              </div>
              <div className="image-container">
                <h3>Resized:</h3>
                <img
                  key={resizedImageUrl} // Force re-render if URL changes slightly (cache busting)
                  src={resizedImageUrl}
                  alt="Resized"
                  // Use the state values for max dimensions for the resized image display
                  style={{ maxWidth: `${width}px`, maxHeight: `${height}px` }}
                />
              </div>
              {/* Action Buttons Container - place below comparison */}
              <div className="result-actions comparison-actions">
                <button
                  className="download-button"
                  onClick={handleDownloadClick}
                  disabled={isLoading}
                >
                  💾 Download Resized
                </button>
                <button
                  className="select-image-button secondary"
                  onClick={() => {
                    setResizedImageUrl(null);
                    setOriginalPreviewUrl(null); // <-- Clear original preview too
                    setUploadStatus("");
                    setLastUploadedKey(null);
                    setSelectedFile(null);
                    setIsLoading(false);
                    stopPolling();
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    // Optionally trigger file input again: handleSelectImageClick();
                  }}
                >
                  Resize Another Image
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageUploader;
