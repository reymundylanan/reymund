import { describe, expect, it } from "vitest";
import { mediaKindForType, parseYouTubeId } from "./serviceMedia";

describe("service media", () => {
  it("reads the video id from any YouTube link", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects other links", () => {
    expect(parseYouTubeId("https://vimeo.com/123")).toBeNull();
    expect(parseYouTubeId("not a link")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });

  it("accepts only allowed file types", () => {
    expect(mediaKindForType("image/jpeg")).toBe("image");
    expect(mediaKindForType("video/mp4")).toBe("video");
    expect(mediaKindForType("video/quicktime")).toBe("video");
    expect(mediaKindForType("image/gif")).toBeNull();
    expect(mediaKindForType("application/pdf")).toBeNull();
  });
});
