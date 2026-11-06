/** Shared mutable core used by the shell and commands. */
import { Fs } from "./fs";
import type { HostState, Session, SimState } from "./types";

export class Core {
  constructor(public state: SimState) {}

  now(): number {
    return this.state.clock;
  }

  host(name: string): HostState {
    const h = this.state.hosts[name];
    if (!h) throw new Error(`unknown host ${name}`);
    return h;
  }

  fs(hostName: string): Fs {
    return new Fs(this.host(hostName), () => this.state.clock);
  }

  session(): Session {
    return this.state.sessions[this.state.sessions.length - 1];
  }

  pushSession(s: Session): void {
    this.state.sessions.push(s);
  }

  /** Deterministic pseudo-random (LCG) for $RANDOM. */
  random(): number {
    this.state.rng = (Math.imul(this.state.rng, 1103515245) + 12345) >>> 0;
    return (this.state.rng >>> 16) & 0x7fff;
  }
}
