import { recordWs } from "@/sdk/traffic";

// Stands in for the `ws` package so every socket the SDK opens shows up in traffic.
class InstrumentedWebSocket extends window.WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    const target = String(url);
    recordWs("connect", target, protocols === undefined ? undefined : { protocols });
    this.addEventListener("open", () => recordWs("open", target, { protocol: this.protocol }));
    this.addEventListener("message", (event) => recordWs("in", target, event.data));
    this.addEventListener("error", () => recordWs("error", target));
    this.addEventListener("close", (event) =>
      recordWs("close", target, { code: event.code, reason: event.reason, wasClean: event.wasClean })
    );
  }

  send(data: Parameters<WebSocket["send"]>[0]) {
    recordWs("out", this.url, data);
    super.send(data);
  }
}

export default InstrumentedWebSocket;
