const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

ffmpeg.setFfmpegPath(
  "C:\\Users\\Admin\\Downloads\\FFmpeg\\FFmpeg\\bin\\ffmpeg.exe"
);

// for railway
if (process.env.FFMPEG_PATH && process.platform === "win32") {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, "project", "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tạo thư mục uploads và outputs nếu chưa có
fs.ensureDirSync("./uploads");
fs.ensureDirSync("./outputs");
fs.ensureDirSync("./temp");

// Cấu hình multer cho upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|mkv|webm|flv/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file video!"));
    }
  },
});

// Store active processes
const activeProcesses = new Map();

// Route chính
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "project", "public", "index.html"));
});

// Download video từ URL
async function downloadVideo(url, outputPath) {
  const response = await axios({
    method: "GET",
    url: url,
    responseType: "stream",
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// Encode video với preset cho social media
function encodeVideo(inputPath, outputPath, preset = "tiktok") {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    // Preset cho các platform khác nhau
    switch (preset) {
      case "tiktok":
        command
          .videoFilters("transpose=1") // Xoay 90 độ cho portrait
          .videoCodec("libx264")
          .addOption("-preset", "slow")
          .addOption("-profile:v", "high")
          .addOption("-level", "4.2")
          .videoBitrate("20000k")
          .addOption("-maxrate", "20000k")
          .addOption("-bufsize", "40000k")
          .addOption("-pix_fmt", "yuv420p")
          .audioCodec("aac")
          .audioBitrate("192k")
          .audioFrequency(48000)
          .addOption("-movflags", "+faststart");
        break;

      case "instagram":
        command
          .videoCodec("libx264")
          .addOption("-preset", "medium")
          .addOption("-profile:v", "main")
          .videoBitrate("8000k")
          .addOption("-maxrate", "8000k")
          .addOption("-bufsize", "16000k")
          .addOption("-pix_fmt", "yuv420p")
          .audioCodec("aac")
          .audioBitrate("128k")
          .audioFrequency(44100)
          .addOption("-movflags", "+faststart");
        break;

      case "facebook":
        command
          .videoCodec("libx264")
          .addOption("-preset", "medium")
          .addOption("-profile:v", "high")
          .videoBitrate("10000k")
          .addOption("-maxrate", "10000k")
          .addOption("-bufsize", "20000k")
          .addOption("-pix_fmt", "yuv420p")
          .audioCodec("aac")
          .audioBitrate("160k")
          .audioFrequency(48000)
          .addOption("-movflags", "+faststart");
        break;
    }

    command
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log("FFmpeg started:", commandLine);
      })
      .on("progress", (progress) => {
        console.log("Progress:", progress.percent + "%");
        // Có thể emit progress qua WebSocket sau này
      })
      .on("end", () => {
        console.log("Encoding finished");
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        reject(err);
      })
      .run();
  });
}

// API endpoint: Process video từ URL
app.post("/api/process-url", async (req, res) => {
  try {
    const { url, preset = "tiktok" } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL video là bắt buộc" });
    }

    const processId = uuidv4();
    const tempInputPath = `./temp/${processId}-input.mp4`;
    const outputPath = `./outputs/${processId}-output-${preset}.mp4`;

    // Track process
    activeProcesses.set(processId, { status: "downloading", progress: 0 });

    // Download video
    console.log("Đang tải video từ URL...");
    await downloadVideo(url, tempInputPath);

    // Update status
    activeProcesses.set(processId, { status: "encoding", progress: 0 });

    // Encode video
    console.log("Đang encode video...");
    await encodeVideo(tempInputPath, outputPath, preset);

    // Cleanup temp file
    fs.removeSync(tempInputPath);

    // Update status
    activeProcesses.set(processId, { status: "completed", progress: 100 });

    res.json({
      success: true,
      processId: processId,
      downloadUrl: `/download/${processId}-output-${preset}.mp4`,
      message: `Video đã được encode thành công cho ${preset.toUpperCase()}!`,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Có lỗi xảy ra khi xử lý video",
      details: error.message,
    });
  }
});

// API endpoint: Process file upload
app.post("/api/process-file", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Vui lòng chọn file video" });
    }

    const { preset = "tiktok" } = req.body;
    const processId = uuidv4();
    const inputPath = req.file.path;
    const outputPath = `./outputs/${processId}-output-${preset}.mp4`;

    // Track process
    activeProcesses.set(processId, { status: "encoding", progress: 0 });

    // Encode video
    console.log("Đang encode video...");
    await encodeVideo(inputPath, outputPath, preset);

    // Cleanup input file
    fs.removeSync(inputPath);

    // Update status
    activeProcesses.set(processId, { status: "completed", progress: 100 });

    res.json({
      success: true,
      processId: processId,
      downloadUrl: `/download/${processId}-output-${preset}.mp4`,
      message: `Video đã được encode thành công cho ${preset.toUpperCase()}!`,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Có lỗi xảy ra khi xử lý video",
      details: error.message,
    });
  }
});

// API endpoint: Get process status
app.get("/api/status/:processId", (req, res) => {
  const { processId } = req.params;
  const process = activeProcesses.get(processId);

  if (!process) {
    return res.status(404).json({ error: "Không tìm thấy process" });
  }

  res.json(process);
});

// Download endpoint
app.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "outputs", filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File không tồn tại" });
  }

  res.download(filePath, (err) => {
    if (err) {
      console.error("Download error:", err);
    } else {
      // Cleanup file after download (optional)
      setTimeout(() => {
        fs.removeSync(filePath);
      }, 60000); // Remove after 1 minute
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  console.log(`📁 Upload folder: ${path.resolve("./uploads")}`);
  console.log(`📁 Output folder: ${path.resolve("./outputs")}`);
});

// Cleanup old files periodically
setInterval(() => {
  const uploadsDir = "./uploads";
  const outputsDir = "./outputs";
  const tempDir = "./temp";

  [uploadsDir, outputsDir, tempDir].forEach((dir) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        const now = new Date().getTime();
        const fileTime = new Date(stats.mtime).getTime();

        // Remove files older than 1 hour
        if (now - fileTime > 3600000) {
          fs.removeSync(filePath);
          console.log(`Đã xóa file cũ: ${filePath}`);
        }
      });
    }
  });
}, 600000); // Check every 10 minutes
