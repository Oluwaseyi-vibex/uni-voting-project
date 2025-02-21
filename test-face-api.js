import * as faceapi from "face-api.js";
import path from "path";

const modelsPath = path.join(process.cwd(), "models");

async function loadModels() {
  console.log("Loading models from:", modelsPath);
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
  console.log("Models loaded successfully!");
}

loadModels().catch(console.error);
