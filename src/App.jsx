import React from "react";
import ImageUploader from "./ImageUploader";
import "./App.css";

function Navbar() {
  const websiteName = "Pixel Pusher"; // Site name

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <span className="navbar-brand">{websiteName}</span>
        </div>
        <div className="navbar-right"></div>
      </div>
    </nav>
  );
}

function Features() {
  const featuresData = [
    {
      icon: "🖼️",
      title: "Perfect quality",
      description:
        "Resize your images with accuracy and clarity—because pixels deserve respect.",
    },
    {
      icon: "👍",
      title: "Click, Shrink, Done",
      description:
        "So easy your pet hamster could use it. Upload, resize, done!",
    },
    {
      icon: "💡",
      title: "Web Wherever",
      description:
        "Runs in your browser—no installs, no drama. Works on Mac, PC, Linux... even on your smart fridge, probably.",
    },
  ];

  return (
    <section className="features-section">
      <div className="features-grid">
        {featuresData.map((feature, index) => (
          <div className="feature-item" key={index}>
            <div className="feature-icon">{feature.icon}</div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-description">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content">
        <header className="main-header">
          <h1>Pixel Pusher</h1>
          <p>Easily resize images online for free.</p>
        </header>
        <ImageUploader />
        <Features />
      </main>
    </div>
  );
}

export default App;
