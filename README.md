# Pixel Pusher

A web application allowing users to upload images, resize them based on specified dimensions and quality settings, and download the results. Built using a serverless architecture on AWS.

## Description

This project provides a user-friendly interface to quickly resize images online. It leverages AWS serverless components (Lambda, S3, API Gateway) for a scalable and cost-effective backend solution. Users can select an image, specify desired maximum dimensions (width/height) and output quality (for formats like JPEG), upload the image, and receive a resized version for download.

## Features

* **Image Upload:** Select images (JPEG, PNG, GIF, WebP etc. supported by Pillow) from your local machine.
* **Custom Dimensions:** Specify maximum width and height for the resized image (aspect ratio is maintained).
* **Quality Control:** Adjust the output quality percentage (1-100) for formats like JPEG to balance file size and visual fidelity.
* **Serverless Resizing:** Image processing happens asynchronously using AWS Lambda triggered by S3 events.
* **Result Display:** The resized image is displayed in the frontend after processing.
* **Download Resized Image:** A download button allows saving the processed image directly.
* **Modern UI:** Frontend built with React and Vite, featuring interactive controls and status updates. (User-provided detail about good CSS styling)

## Tech Stack

* **Frontend:** React, Vite, JavaScript (JSX), CSS
* **Backend:**
    * AWS Lambda (Python runtime)
    * AWS S3 (for storing original and resized images)
    * AWS API Gateway (HTTP API for generating pre-signed URLs)
    * AWS IAM (for managing permissions)
    * Pillow (Python Imaging Library for image processing)
* **Deployment/Tools:** Docker (for building Lambda layers), AWS CLI/Console

## Architecture Overview

1.  **Frontend (React/Vite):** User selects an image, target dimensions, and quality.
2.  **Request Pre-signed URL:** Frontend sends filename, dimensions, and quality to an API Gateway endpoint.
3.  **Generate URL Lambda:** An AWS Lambda function (`generate-presigned-url` or similar) receives the request, validates parameters, constructs an S3 object key (encoding parameters like quality/dimensions, e.g., `q85_w128_h128/myimage.png`), generates a pre-signed S3 PUT URL using `boto3`, and returns the URL and the final object key to the frontend.
4.  **S3 Upload:** Frontend uses the pre-signed URL to upload the original image directly to the input S3 bucket using a `PUT` request with the generated object key.
5.  **S3 Trigger:** The successful upload to the input bucket triggers the image resizing Lambda function via an S3 event notification.
6.  **Resize Lambda:**
    * Receives the S3 event containing the input bucket name and object key.
    * Parses parameters (quality, dimensions) from the object key.
    * Downloads the original image from the input bucket using `boto3`.
    * Resizes the image using the Pillow library according to the parsed parameters.
    * Constructs an output key (e.g., `resized-q85_w128_h128/myimage.jpeg`).
    * Uploads the resized image to the output S3 bucket.
7.  **Frontend Polling:** After initiating the upload, the frontend starts polling a calculated URL (based on the expected output key) for the resized image in the output bucket using `HEAD` requests.
8.  **Display/Download:** Once the polling confirms the resized image exists (responds with 200 OK), the frontend displays the image using its public S3 URL and enables the download button.


## Setup

### Prerequisites

* Node.js and npm/yarn
* AWS Account with Free Tier (or appropriate limits)
* AWS CLI configured (optional, can use Console)
* Docker Desktop (for building Python Lambda layers with dependencies)

### Backend (AWS Setup)

1.  **S3 Buckets:** Create two S3 buckets in your desired region (e.g., `eu-north-1`):
    * An **input bucket** (e.g., `your-prefix-image-resizer-input`). Configure CORS to allow `PUT` requests from your frontend origin.
    * An **output bucket** (e.g., `your-prefix-image-resizer-output`). Configure **Bucket Policy** to allow public `s3:GetObject`. Configure **CORS** to allow `GET` and `HEAD` requests from your frontend origin. Disable "Block all public access" settings (ensure you understand the implications).
2.  **IAM Roles:**
    * Create an IAM role for the pre-signed URL Lambda with permissions to generate pre-signed PUT URLs for the input bucket (`s3:PutObject` on `arn:aws:s3:::input-bucket/*`) and basic CloudWatch logging (`AWSLambdaBasicExecutionRole`).
    * Create an IAM role for the resizing Lambda with permissions for CloudWatch logging (`AWSLambdaBasicExecutionRole`), reading from the input bucket (`s3:GetObject` on `arn:aws:s3:::input-bucket/*`), and writing to the output bucket (`s3:PutObject` on `arn:aws:s3:::output-bucket/*`).
3.  **Lambda Layer (Pillow):** Build a Lambda layer containing the Pillow library compatible with your chosen Python runtime (e.g., Python 3.11/3.12/3.13) and architecture (`x86_64` or `arm64`). Use Docker for building as detailed in previous steps to ensure compatibility. Upload and publish the layer.
4.  **Lambda Functions:**
    * Create the **pre-signed URL generation Lambda function**. Use Python, attach the corresponding IAM role, set the `INPUT_BUCKET_NAME` environment variable. Deploy the code.
    * Create the **image resizing Lambda function**. Use Python, attach its IAM role, set the `OUTPUT_BUCKET_NAME` environment variable. **Attach the Pillow Lambda Layer**. Deploy the code. Configure an **S3 Trigger** pointing to the input bucket (e.g., "All object create events"). Adjust memory/timeout as needed.
5.  **API Gateway:** Create an HTTP API Gateway. Add a route (e.g., `GET /api/get-upload-url`) that integrates with the pre-signed URL generation Lambda function. Note the **Invoke URL** of the deployed API stage. Enable CORS for the route if necessary (though the Lambda might handle basic CORS headers).

### Frontend (Local Setup)

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/CptPrice743/serverless-image-resizer.git
    cd serverless-image-resizer
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Configure Environment Variables:** Update the configuration constants within the React code (e.g., in `ImageUploader.jsx` or a separate config file) to match your AWS setup:
    * `outputBucketName`: Your output S3 bucket name.
    * `region`: The AWS region of your buckets.
    * `API_BASE_URL`: The Invoke URL of your API Gateway endpoint (without the specific path).
4.  **Run Development Server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
5.  Open your browser to `http://localhost:5173` (or the port specified).

## Usage

1.  Open the application in your web browser.
2.  Click "Select Image" or drag and drop an image file.
3.  Adjust the desired maximum dimensions (width/height) and quality percentage using the controls.
4.  Click "Upload & Resize Image".
5.  Wait for the status messages ("Uploading...", "Processing image...", "Waiting for resized version...").
6.  The resized image will appear once processing is complete.
7.  Click the "Download Image" button to save the result.
8.  Click "Resize Another Image" to start over.
