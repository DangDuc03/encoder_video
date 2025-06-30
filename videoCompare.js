// videoCompareSingle.js (fix duration & size fallback)
const ffprobe = require("ffprobe"),
  ffprobeStatic = require("ffprobe-static");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askPath = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().replace(/^"|"$/g, ""));
    });
  });
};

const getDuration = (format, streams) => {
  if (format?.duration) return format.duration;
  const videoStream = streams.find((s) => s.codec_type === "video");
  return videoStream?.duration || "?";
};

const getSizeMB = (format, filePath) => {
  if (format?.size) return (format.size / 1024 / 1024).toFixed(2);
  try {
    const stats = fs.statSync(filePath);
    return (stats.size / 1024 / 1024).toFixed(2);
  } catch {
    return "?";
  }
};

const compareVideos = async (original, encoded) => {
  const [oData, eData] = await Promise.all([
    ffprobe(original, { path: ffprobeStatic.path }),
    ffprobe(encoded, { path: ffprobeStatic.path }),
  ]);

  const oStream = oData.streams.find((s) => s.codec_type === "video");
  const eStream = eData.streams.find((s) => s.codec_type === "video");
  const oAudio = oData.streams.find((s) => s.codec_type === "audio");
  const eAudio = eData.streams.find((s) => s.codec_type === "audio");

  const durationO = getDuration(oData.format, oData.streams);
  const durationE = getDuration(eData.format, eData.streams);
  const sizeO = getSizeMB(oData.format, original);
  const sizeE = getSizeMB(eData.format, encoded);

  console.log("\n============================");
  console.log(
    `🎞 So sánh video: ${path.basename(original)} vs ${path.basename(encoded)}`
  );
  console.log("----------------------------");
  console.log(`📽 Codec: ${oStream?.codec_name} → ${eStream?.codec_name}`);
  console.log(`📐 Resolution: ${oStream?.width}x${oStream?.height}`);
  console.log(`🎞 FPS: ${oStream?.r_frame_rate}`);
  console.log(`🎨 Pix format: ${oStream?.pix_fmt}`);
  console.log(`🔊 Audio codec: ${oAudio?.codec_name} → ${eAudio?.codec_name}`);
  console.log(`🔉 Audio bitrate: ${oAudio?.bit_rate} → ${eAudio?.bit_rate}`);
  console.log(`🕒 Duration: ${durationO}s → ${durationE}s`);
  console.log(`💾 Size: ${sizeO}MB → ${sizeE}MB`);
  console.log("============================\n");
};

(async () => {
  const originalPath = await askPath("🔹 Nhập đường dẫn FILE video gốc: ");
  const encodedPath = await askPath("🔹 Nhập đường dẫn FILE video đã encode: ");
  rl.close();

  try {
    await compareVideos(originalPath, encodedPath);
  } catch (err) {
    console.error(`⚠️ Lỗi khi so sánh:`, err.message);
  }
})();
