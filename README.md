# 🎓 教 Jiao - Offline Machine Learning Classifier

## 📋 Table of Contents
- [📖 About](#-about)
- [🚀 Getting Started](#-getting-started)
- [🔨 How to Build / How to Run](#-how-to-build--how-to-run)
- [🏗️ Project Structure](#️-project-structure)
- [🎯 Features](#-features)
- [📚 Dependencies](#-dependencies)
- [🐳 Docker Deployment](#-docker-deployment)
- [💡 Usage](#-usage)
- [🧠 Machine Learning Architecture](#-machine-learning-architecture)
- [⚙️ Configuration](#️-configuration)
- [📄 License](#-license)

## 📖 About
Jiao (教, meaning "teach" in Chinese) is a fully offline Progressive Web App that enables users to create custom image classifiers through transfer learning. Built with TensorFlow.js and using MobileNet as the base model, it provides an intuitive interface for teaching AI to recognize custom objects without requiring any server-side processing or internet connectivity.

The application follows a simple three-step workflow: **Teach** (add classes and collect samples), **Train** (build a custom classifier), and **Analyze** (classify new images or camera frames).

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm package manager
- Modern web browser with WebGL support
- Camera access (optional, for live sample collection)

### 📦 Installation
```bash
git clone <repository-url>
cd jiao
npm install
```

## 🔨 How to Build / How to Run

### Development Mode
```bash
# Start the development server
node server.js
```
The application will be available at `http://localhost:3000`

### Production Mode
```bash
# Install dependencies
npm install

# Start the production server
node server.js
```

The server automatically serves all static assets and handles caching strategies for optimal offline performance.

## 🏗️ Project Structure
```
jiao/
├── index.html              # Main application interface
├── main.js                 # Core ML logic and UI interactions
├── styles.js               # CSS-in-JS styling definitions
├── server.js               # Express server with cache management
├── service-worker.js       # Advanced offline caching strategy
├── tf.min.js              # TensorFlow.js library
├── model.json             # Pre-trained MobileNet model metadata
├── group1-shard1of1       # Model weight files (55 shards total)
├── ...                    # Additional weight shards
├── manifest.json          # PWA manifest
├── package.json           # Node.js dependencies
├── dockerfile             # Docker containerization
├── .gitignore            # Git ignore patterns
├── LICENSE               # Apache 2.0 license
└── .github/workflows/    # CI/CD automation
    └── main.yaml         # Docker build workflow
```

## 🎯 Features

### Core Machine Learning
- **Transfer Learning**: Uses pre-trained MobileNet v1 as feature extractor
- **Custom Classification**: Train classifiers with as few as 1 sample per class
- **Real-time Training**: Browser-based model training with live feedback
- **Grid-based Counting**: Approximate object counting through spatial analysis
- **Model Persistence**: Save/load trained models to IndexedDB

### User Experience
- **Fully Offline**: Complete functionality without internet connectivity
- **Camera Integration**: Live sample collection and real-time analysis
- **Drag & Drop**: Intuitive file upload interface
- **Progressive Web App**: Installable with native app experience
- **Analysis History**: Persistent result tracking with thumbnails
- **Export Capabilities**: Download trained models for external use

### Technical Excellence
- **Advanced Service Worker**: Adaptive caching with network-first strategy
- **Memory Management**: Automatic tensor disposal to prevent memory leaks
- **Responsive Design**: Mobile-optimized interface
- **Robust Error Handling**: Graceful degradation and user feedback

## 📚 Dependencies

### Runtime Dependencies
- **Express**: `^4.18.2` - Lightweight web server
- **TensorFlow.js**: Embedded - Client-side machine learning framework

### Pre-trained Model
- **MobileNet v1 0.25-224**: Lightweight convolutional neural network optimized for mobile devices
- **Model Size**: ~55 weight shards totaling several MB
- **Input Size**: 224x224 RGB images
- **Architecture**: Depthwise separable convolutions for efficiency

### Browser Requirements
- **WebGL Support**: Required for TensorFlow.js acceleration
- **IndexedDB**: For model and result persistence
- **Camera API**: Optional, for live sample collection
- **Service Workers**: For offline functionality

## 🐳 Docker Deployment

### Build Docker Image
```bash
docker build -t jiao:latest .
```

### Run Container
```bash
docker run -p 3000:3000 jiao:latest
```

### Docker Configuration
- **Base Image**: Node.js 23 Alpine (lightweight)
- **Working Directory**: `/app`
- **Exposed Port**: 3000
- **Auto-install**: Dependencies installed during build

### CI/CD Integration
The repository includes GitHub Actions workflow for automated Docker builds:
- Manual trigger only (workflow_dispatch)
- Builds and pushes to Docker Hub
- Requires `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets

## 💡 Usage

### Teaching Phase
1. **Create Project**: Enter a descriptive project name
2. **Add Classes**: Define categories you want to classify (minimum 2)
3. **Collect Samples**: 
   - Use camera for live capture
   - Upload existing images (supports multiple formats)
   - Minimum 1 sample per class required
4. **Review**: Check class distribution and sample counts

### Training Phase
1. **Click Train**: Initiates transfer learning process
2. **Feature Extraction**: Base model processes all samples
3. **Head Training**: Custom classifier trained on extracted features
4. **Validation**: Model ready for inference

### Analysis Phase
1. **Upload/Capture**: Select image or use camera frame
2. **Classify**: Get top-K predictions with confidence scores
3. **Count Objects**: Optional grid-based counting (configurable)
4. **Review Results**: View analysis history with thumbnails

### Model Management
- **Save**: Store trained model in browser's IndexedDB
- **Load**: Restore previously saved models
- **Export**: Download model files for external use
- **Clear**: Remove saved models to free storage

## 🧠 Machine Learning Architecture

### Transfer Learning Pipeline
```
Input Image (224x224) 
    ↓
MobileNet Feature Extractor
    ↓
Global Average Pooling
    ↓
Dense Layer (256 units, ReLU)
    ↓
Dropout (0.2)
    ↓
Output Layer (n_classes, Softmax)
```

### Training Configuration
- **Base Model**: MobileNet v1 0.25 (frozen weights)
- **Head Architecture**: 256-unit dense layer + dropout
- **Optimizer**: Adam (learning rate: 0.001)
- **Loss Function**: Categorical crossentropy
- **Batch Size**: 16
- **Epochs**: 8 (configurable)
- **Data Augmentation**: Random horizontal flip

### Inference Features
- **Top-K Predictions**: Configurable number of top results
- **Confidence Thresholds**: Filter low-confidence predictions
- **Spatial Analysis**: Grid-based counting for object detection
- **Real-time Processing**: Live camera analysis

## ⚙️ Configuration

### Developer Configuration (main.js CONFIG object)
```javascript
const CONFIG = {
  MODEL_VERSION: 'MobileNet v1 0.25-224 (Layers)',
  MIN_CLASSES: 2,              // Minimum classes for training
  MIN_SAMPLES_PER_CLASS: 1,    // Minimum samples per class
  INPUT_SIZE: 224,             // Model input dimensions
  EPOCHS: 8,                   // Training epochs
  BATCH: 16,                   // Batch size
  LEARNING_RATE: 1e-3,         // Adam learning rate
  HEAD_UNITS: 256,             // Dense layer units
  DROPOUT: 0.2,                // Dropout rate
  AUGMENT: true,               // Enable data augmentation
  TOPK: 3,                     // Number of top predictions
  COUNT_BY_GRID: true,         // Enable object counting
  GRID_CELLS: 6,               // Grid size (6x6)
  GRID_CONF: 0.6               // Minimum confidence for counting
};
```

### Service Worker Configuration
- **Cache Strategy**: Network-first with intelligent fallbacks
- **Timeout Handling**: 30s for first-time users, 5s for returning users
- **Asset Management**: Complete atomic updates only
- **Version Control**: Automatic cleanup of old cache versions

### Progressive Web App
- **Installable**: Full PWA manifest with icons
- **Offline-first**: Complete functionality without network
- **Responsive**: Optimized for mobile and desktop
- **Analytics**: Optional usage tracking (configurable)

## 📄 License
Apache License 2.0 - see [LICENSE](LICENSE) file for details.

---

**Note**: This application runs entirely in the browser without sending any data to external servers, ensuring complete privacy and offline capability.
