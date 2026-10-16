/**
 * ntfy.ts — Push Notification System via ntfy.sh for BWCut Studio
 * Sends push notifications directly to user's mobile phone (iOS / Android)
 */

export interface NtfyOptions {
  topic: string;
  title?: string;
  message: string;
  priority?: "min" | "low" | "default" | "high" | "urgent";
  tags?: string[];
  clickUrl?: string;
}

export async function sendNtfyNotification(options: NtfyOptions): Promise<{ success: boolean; error?: string }> {
  const { topic, title = "BWCut Studio", message, priority = "default", tags = ["scissors"], clickUrl } = options;

  if (!topic || topic.trim() === "") {
    return { success: false, error: "ntfy topic is empty" };
  }

  const cleanTopic = topic.trim().replace(/^https?:\/\/ntfy\.sh\//, "");
  const endpoint = `https://ntfy.sh/${encodeURIComponent(cleanTopic)}`;

  try {
    const headers: Record<string, string> = {
      "Title": encodeURIComponent(title), // UTF-8 encoded title
      "Priority": priority,
      "Tags": tags.join(","),
    };

    if (clickUrl) {
      headers["Click"] = clickUrl;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: message,
    });

    if (response.ok) {
      return { success: true };
    } else {
      const errText = await response.text();
      return { success: false, error: `ntfy HTTP ${response.status}: ${errText}` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function sendRenderCompletedNotification(topic: string, clipName: string, durationSec: number): Promise<{ success: boolean; error?: string }> {
  return sendNtfyNotification({
    topic,
    title: "🎬 เรนเดอร์คลิปสำเร็จ!",
    message: `คลิป "${clipName}" เรนเดอร์เสร็จแล้ว (${durationSec.toFixed(1)} วิ)\nพร้อมนำไปโพสต์ได้ทันทีครับ`,
    priority: "high",
    tags: ["white_check_mark", "movie_camera"],
  });
}

export async function sendBatchCompletedNotification(topic: string, count: number, totalTimeSec: number): Promise<{ success: boolean; error?: string }> {
  return sendNtfyNotification({
    topic,
    title: "🎉 เรนเดอร์ยกชุดเสร็จสมบูรณ์!",
    message: `เรนเดอร์ทั้งหมด ${count} คลิปเรียบร้อยแล้ว รวมเวลา ${Math.round(totalTimeSec)} วินาที`,
    priority: "urgent",
    tags: ["tada", "fire"],
  });
}
