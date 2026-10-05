// noVNC ships no types; these are the members the experts' screen ("Son ordinateur") uses.
declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: Record<string, unknown>);
    viewOnly: boolean;
    scaleViewport: boolean;
    background: string;
    focus(): void;
    disconnect(): void;
  }
}
