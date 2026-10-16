// Reproduce the existing CP brand mark using macOS vector text rendering.
import AppKit
import Foundation
let output = CommandLine.arguments[1]
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(calibratedRed: 56/255, green: 110/255, blue: 105/255, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 192, yRadius: 192).fill()
let c = "C" as NSString
let p = "p" as NSString
let cStyle: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 555, weight: .medium), .foregroundColor: NSColor.white]
let pStyle: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 424, weight: .medium), .foregroundColor: NSColor.white]
c.draw(at: NSPoint(x: 193, y: 190), withAttributes: cStyle)
p.draw(at: NSPoint(x: 510, y: 221), withAttributes: pStyle)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
