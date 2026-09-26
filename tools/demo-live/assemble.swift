// Assembles the live demo: FLUX opener under the intro narration, then the recorded scenes with narration.
import AVFoundation
import CoreGraphics
import ImageIO
import Foundation
setvbuf(stdout, nil, _IONBF, 0)

let dir = CommandLine.arguments[1]
let openerURL = URL(fileURLWithPath: CommandLine.arguments[2])
let outURL = URL(fileURLWithPath: CommandLine.arguments[3])
let W = 1920, H = 1080, FPS = 30
let XFADE = 0.4, TAIL_HOLD = 1.2, FADE = 1.0

struct RFrame: Decodable { let file: String; let t: Double }
struct RScene: Decodable { let id: String; let start: Double; let end: Double }
struct Recording: Decodable { let scenes: [RScene]; let frames: [RFrame] }
let rec = try JSONDecoder().decode(Recording.self, from: Data(contentsOf: URL(fileURLWithPath: dir + "/recording.json")))
let frames = rec.frames.sorted { $0.t < $1.t }

func audioDuration(_ path: String) async throws -> Double { try await AVURLAsset(url: URL(fileURLWithPath: path)).load(.duration).seconds }
let introNarr = try await audioDuration(dir + "/seg-intro.aiff")
let openerDur = try await AVURLAsset(url: openerURL).load(.duration).seconds
let introLen = max(openerDur, introNarr + 0.9)

// Output timeline: intro, then each recorded scene at its recorded length.
var sceneOut: [(scene: RScene, outStart: Double)] = []
var cursor = introLen
for s in rec.scenes { sceneOut.append((s, cursor)); cursor += s.end - s.start }
let total = cursor + TAIL_HOLD + FADE

func loadJPEG(_ file: String) -> CGImage? {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: dir + "/frames/" + file) as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}
var cache: (String, CGImage)? = nil
func frameAt(_ scene: RScene, _ src: Double) -> CGImage? {
  // Latest recorded frame at or before the source time, within this scene (screencast only emits on change).
  var lo = 0, hi = frames.count - 1, best = -1
  while lo <= hi { let mid = (lo + hi) / 2; if frames[mid].t <= src { best = mid; lo = mid + 1 } else { hi = mid - 1 } }
  if best < 0 || frames[best].t < scene.start - 0.5 { best = frames.firstIndex { $0.t >= scene.start } ?? -1 }
  guard best >= 0 else { return nil }
  let f = frames[best]
  if let c = cache, c.0 == f.file { return c.1 }
  guard let img = loadJPEG(f.file) else { return nil }
  cache = (f.file, img); return img
}

final class ClipReader {
  let output: AVAssetReaderTrackOutput; let reader: AVAssetReader
  var current: CGImage?; var next: CMSampleBuffer?
  init(url: URL) async throws {
    let asset = AVURLAsset(url: url); let track = try await asset.loadTracks(withMediaType: .video)[0]
    reader = try AVAssetReader(asset: asset)
    output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    reader.add(output); reader.startReading(); next = output.copyNextSampleBuffer()
  }
  func frame(at t: Double) -> CGImage? {
    while let s = next, CMSampleBufferGetPresentationTimeStamp(s).seconds <= t {
      if let pb = CMSampleBufferGetImageBuffer(s) {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: CVPixelBufferGetWidth(pb), height: CVPixelBufferGetHeight(pb), bitsPerComponent: 8,
          bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        current = ctx?.makeImage(); CVPixelBufferUnlockBaseAddress(pb, .readOnly)
      }
      next = output.copyNextSampleBuffer()
    }
    return current
  }
}

let tmpURL = URL(fileURLWithPath: dir + "/demo-video-only.mp4")
try? FileManager.default.removeItem(at: tmpURL)
let writer = try AVAssetWriter(outputURL: tmpURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let opener = try await ClipReader(url: openerURL)
let full = CGRect(x: 0, y: 0, width: W, height: H)
var lastOpener: CGImage? = nil

func letterbox(_ img: CGImage) -> CGRect {
  let s = min(Double(W) / Double(img.width), Double(H) / Double(img.height)); let w = Double(img.width) * s, h = Double(img.height) * s
  return CGRect(x: (Double(W) - w) / 2, y: (Double(H) - h) / 2, width: w, height: h)
}
func sceneImage(_ i: Int, _ t: Double) -> CGImage? {
  let (s, o) = sceneOut[i]; return frameAt(s, min(s.end, s.start + (t - o)))
}

let count = Int((total * Double(FPS)).rounded())
for i in 0..<count {
  let t = Double(i) / Double(FPS)
  while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
  var pbOut: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pbOut); let pb = pbOut!
  CVPixelBufferLockBaseAddress(pb, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.interpolationQuality = .high
  ctx.setFillColor(CGColor(red: 0.043, green: 0.067, blue: 0.11, alpha: 1)); ctx.fill(full)
  if t < introLen {
    if t < openerDur, let img = opener.frame(at: t) { lastOpener = img }
    if let img = lastOpener { ctx.draw(img, in: letterbox(img)) }
  } else {
    let k = sceneOut.lastIndex { $0.outStart <= t } ?? 0
    let local = t - sceneOut[k].outStart
    if local < XFADE {
      // Short crossfade from whatever was on screen before this scene.
      if k == 0 { if let img = lastOpener { ctx.draw(img, in: letterbox(img)) } }
      else if let prev = sceneImage(k - 1, sceneOut[k].outStart - 0.001) { ctx.draw(prev, in: full) }
      if let img = sceneImage(k, t) { ctx.saveGState(); ctx.setAlpha(local / XFADE); ctx.draw(img, in: full); ctx.restoreGState() }
    } else if let img = sceneImage(k, t) { ctx.draw(img, in: full) }
  }
  if t > total - FADE { ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: (t - (total - FADE)) / FADE)); ctx.fill(full) }
  CVPixelBufferUnlockBaseAddress(pb, [])
  adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: CMTimeScale(FPS)))
}
input.markAsFinished(); await writer.finishWriting()
guard writer.status == .completed else { fatalError("write failed \(String(describing: writer.error))") }

// Audio: FLUX opener music (lowered under the intro narration) + narration at each scene start.
print("step: video written")
let comp = AVMutableComposition()
let vAsset = AVURLAsset(url: tmpURL)
let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try cv.insertTimeRange(CMTimeRange(start: .zero, duration: try await vAsset.load(.duration)), of: try await vAsset.loadTracks(withMediaType: .video)[0], at: .zero)
print("step: video inserted")
let music = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
// Keep the asset alive: a track whose asset has been released can't be inserted.
let openerAsset = AVURLAsset(url: openerURL)
if let oa = try await openerAsset.loadTracks(withMediaType: .audio).first {
  // Use the audio track's own range; it can be slightly shorter than the clip's video.
  try music.insertTimeRange(try await oa.load(.timeRange), of: oa, at: .zero)
}
print("step: music inserted")
let voice = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let starts: [(String, Double)] = [("intro", 0.5)] + sceneOut.map { ($0.scene.id, $0.outStart + 0.25) }
for (id, start) in starts {
  print("step: voice \(id) at \(start)")
  let a = AVURLAsset(url: URL(fileURLWithPath: dir + "/seg-\(id).aiff"))
  let track = try await a.loadTracks(withMediaType: .audio)[0]
  try voice.insertTimeRange(try await track.load(.timeRange), of: track,
    at: CMTime(seconds: start, preferredTimescale: 600))
}
let mix = AVMutableAudioMix()
let musicParams = AVMutableAudioMixInputParameters(track: music); musicParams.setVolume(0.28, at: .zero)
let voiceParams = AVMutableAudioMixInputParameters(track: voice); voiceParams.setVolume(1.0, at: .zero)
mix.inputParameters = [musicParams, voiceParams]
try? FileManager.default.removeItem(at: outURL)
let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
export.outputURL = outURL; export.outputFileType = .mp4; export.audioMix = mix
await export.export()
guard export.status == .completed else { fatalError("export failed \(String(describing: export.error))") }
print(String(format: "wrote %@ (%.1f s)", outURL.path, total))
