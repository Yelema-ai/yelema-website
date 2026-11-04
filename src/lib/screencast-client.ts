// "Son ordinateur" for a member of a team instance: the tabs of their own experts only, streamed as images by the
// instance's browser relay (no shared desktop). Same surface as the noVNC client ComputerProvider drives:
// viewOnly, focus, disconnect, and "connect" / "disconnect" events.

type Listener = () => void;
type Frame = { t: "frame"; data: string; w?: number; h?: number } | { t: "empty" } | { t: "tabs" };

const BUTTONS = ["left", "middle", "right"] as const;

export class ScreencastClient {
  private ws: WebSocket;
  private canvas = document.createElement("canvas");
  private listeners: Record<"connect" | "disconnect", Listener[]> = { connect: [], disconnect: [] };
  private frame = { w: 1, h: 1 };
  private closed = false;
  viewOnly = true;

  constructor(host: HTMLElement, url: string) {
    Object.assign(this.canvas.style, { width: "100%", height: "100%", objectFit: "contain", outline: "none", background: "#f3f1f8" });
    this.canvas.tabIndex = 0;
    host.replaceChildren(this.canvas);
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.emit("connect");
    this.ws.onclose = () => !this.closed && this.emit("disconnect");
    this.ws.onmessage = (e) => this.draw(JSON.parse(String(e.data)) as Frame);
    this.bindInput();
  }

  addEventListener(type: "connect" | "disconnect", fn: Listener): void {
    this.listeners[type].push(fn);
  }

  focus(): void {
    this.canvas.focus();
  }

  disconnect(): void {
    this.closed = true;
    this.ws.close();
  }

  private emit(type: "connect" | "disconnect"): void {
    for (const fn of this.listeners[type]) fn();
  }

  private draw(m: Frame): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    if (m.t === "empty") {
      this.canvas.width = 640;
      this.canvas.height = 360;
      ctx.fillStyle = "#f3f1f8";
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = "#6b6680";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Aucune page ouverte par vos experts pour l’instant.", 320, 180);
      return;
    }
    if (m.t !== "frame") return;
    const img = new Image();
    img.onload = () => {
      this.frame = { w: m.w || img.width, h: m.h || img.height };
      if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
      }
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${m.data}`;
  }

  /** Canvas pixels → the page's own coordinates (the frame is drawn letterboxed with object-fit: contain). */
  private point(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const scale = Math.min(r.width / this.canvas.width, r.height / this.canvas.height) || 1;
    const ox = (r.width - this.canvas.width * scale) / 2;
    const oy = (r.height - this.canvas.height * scale) / 2;
    const cx = (e.clientX - r.left - ox) / scale;
    const cy = (e.clientY - r.top - oy) / scale;
    return { x: (cx * this.frame.w) / this.canvas.width, y: (cy * this.frame.h) / this.canvas.height };
  }

  private send(m: Record<string, unknown>): void {
    if (!this.viewOnly && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private bindInput(): void {
    const c = this.canvas;
    const mouse = (type: string) => (e: MouseEvent) => {
      if (this.viewOnly) return;
      e.preventDefault();
      this.send({ t: "mouse", type, ...this.point(e), button: BUTTONS[e.button] ?? "left", clickCount: e.detail || 1 });
    };
    c.addEventListener("mousedown", mouse("mousePressed"));
    c.addEventListener("mouseup", mouse("mouseReleased"));
    c.addEventListener("mousemove", mouse("mouseMoved"));
    c.addEventListener("contextmenu", (e) => !this.viewOnly && e.preventDefault());
    c.addEventListener("wheel", (e) => {
      if (this.viewOnly) return;
      e.preventDefault();
      this.send({ t: "wheel", ...this.point(e), dx: e.deltaX, dy: e.deltaY });
    }, { passive: false });
    const key = (type: "keyDown" | "keyUp") => (e: KeyboardEvent) => {
      if (this.viewOnly) return;
      e.preventDefault();
      this.send({ t: "key", type, key: e.key, code: e.code, keyCode: e.keyCode, ...(type === "keyDown" && e.key.length === 1 ? { text: e.key } : {}) });
    };
    c.addEventListener("keydown", key("keyDown"));
    c.addEventListener("keyup", key("keyUp"));
  }
}
