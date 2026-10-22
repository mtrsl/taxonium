export interface DotCoordinate {
  x: number;
  y: number;
}

export interface ParsedDotEmbedding {
  coordinates: Map<string, DotCoordinate>;
  invalidCoordinateRecords: number;
}

interface Token {
  kind: "id" | "symbol" | "edge";
  value: string;
  offset: number;
}

interface CoordinateState {
  x?: string;
  y?: string;
  pos?: string;
  touched: boolean;
}

const isSpace = (char: string) => /\s/.test(char);
const isNumber = (value: string) => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);

/** A lazy lexer keeps large one-line DOT files bounded and yields while scanning. */
class DotTokenizer {
  private index: number;
  private lastCheckpoint: number;

  constructor(private readonly source: string, private readonly checkpoint: () => Promise<void>) {
    this.index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    this.lastCheckpoint = this.index;
  }

  private async checkProgress(): Promise<void> {
    if (this.index - this.lastCheckpoint >= 65536) {
      this.lastCheckpoint = this.index;
      await this.checkpoint();
    }
  }

  private async decodeQuoted(): Promise<{ value: string; next: number }> {
    let value = "";
    let index = this.index + 1;
    while (index < this.source.length) {
      if (index - this.lastCheckpoint >= 65536) {
        this.lastCheckpoint = index;
        await this.checkpoint();
      }
      const char = this.source[index++];
      if (char === '"') return { value, next: index };
      if (char !== "\\") {
        value += char;
        continue;
      }
      if (index >= this.source.length) throw new Error("Unterminated escape in quoted DOT identifier");
      const escaped = this.source[index++];
      if (escaped === "\n") continue;
      if (escaped === "\r") {
        if (this.source[index] === "\n") index++;
        continue;
      }
      value += escaped;
    }
    throw new Error("Unterminated quoted DOT identifier");
  }

  async next(): Promise<Token | undefined> {
    while (this.index < this.source.length) {
      await this.checkProgress();
      const char = this.source[this.index];
      if (isSpace(char)) { this.index++; continue; }
      if (char === "#") {
        while (this.index < this.source.length && this.source[this.index] !== "\n") {
          this.index++;
          await this.checkProgress();
        }
        continue;
      }
      if (char === "/" && this.source[this.index + 1] === "/") {
        this.index += 2;
        while (this.index < this.source.length && this.source[this.index] !== "\n") {
          this.index++;
          await this.checkProgress();
        }
        continue;
      }
      if (char === "/" && this.source[this.index + 1] === "*") {
        const start = this.index;
        const end = this.source.indexOf("*/", this.index + 2);
        if (end < 0) throw new Error("Unterminated block comment in DOT embedding");
        this.index = end + 2;
        if (this.index - start >= 65536) await this.checkpoint();
        this.lastCheckpoint = this.index;
        continue;
      }
      if (char === '"') {
        const offset = this.index;
        const decoded = await this.decodeQuoted();
        this.index = decoded.next;
        return { kind: "id", value: decoded.value, offset };
      }
      if (char === "<") {
        const start = this.index++;
        let depth = 1;
        while (this.index < this.source.length && depth > 0) {
          if (this.source[this.index] === "<") depth++;
          else if (this.source[this.index] === ">") depth--;
          this.index++;
          await this.checkProgress();
        }
        if (depth !== 0) throw new Error("Unterminated HTML identifier in DOT embedding");
        return { kind: "id", value: this.source.slice(start, this.index), offset: start };
      }
      if (char === "-" && [">", "-"].includes(this.source[this.index + 1] ?? "")) {
        const offset = this.index;
        const value = this.source.slice(this.index, this.index + 2);
        this.index += 2;
        return { kind: "edge", value, offset };
      }
      if ("{}[]=;,:".includes(char)) return { kind: "symbol", value: char, offset: this.index++ };

      const start = this.index;
      while (this.index < this.source.length && !isSpace(this.source[this.index]) &&
        !"{}[]=;,:\"<>".includes(this.source[this.index]) &&
        !(this.source[this.index] === "/" && ["/", "*"].includes(this.source[this.index + 1] ?? "")) &&
        !(this.source[this.index] === "-" && [">", "-"].includes(this.source[this.index + 1] ?? ""))) {
        this.index++;
        await this.checkProgress();
      }
      if (this.index === start) throw new Error(`Unexpected character in DOT embedding at ${this.index}`);
      return { kind: "id", value: this.source.slice(start, this.index), offset: start };
    }
    return undefined;
  }
}

class CoordinateParser {
  private readonly tokenizer: DotTokenizer;
  private readonly buffer: Token[] = [];
  private readonly coordinates = new Map<string, CoordinateState>();

  constructor(source: string, private readonly checkpoint: () => Promise<void>) {
    this.tokenizer = new DotTokenizer(source, checkpoint);
  }

  async parse(): Promise<ParsedDotEmbedding> {
    if (!(await this.peek())) throw new Error("DOT embedding is empty");
    if ((await this.peek())?.value.toLowerCase() === "strict") await this.take();
    const kind = (await this.takeId("Expected graph or digraph declaration")).value.toLowerCase();
    if (kind !== "graph" && kind !== "digraph") throw new Error("DOT embedding must start with graph or digraph");
    if ((await this.peek())?.value !== "{") await this.takeId("Expected graph identifier or opening brace");
    await this.expect("{", "Expected opening brace for DOT graph");
    await this.parseStatements();
    if (await this.peek()) throw new Error("Unexpected content after DOT graph");

    const result = new Map<string, DotCoordinate>();
    let invalidCoordinateRecords = 0, checked = 0;
    for (const [identifier, state] of this.coordinates) {
      if (checked++ % 8192 === 0) await this.checkpoint();
      const explicitX = state.x === undefined ? null : this.number(state.x);
      const explicitY = state.y === undefined ? null : this.number(state.y);
      const coordinate = explicitX !== null && explicitY !== null
        ? { x: explicitX, y: explicitY }
        : this.parsePosition(state.pos);
      if (coordinate && Number.isFinite(coordinate.x) && Number.isFinite(coordinate.y)) result.set(identifier, coordinate);
      else if (state.touched) invalidCoordinateRecords++;
    }
    return { coordinates: result, invalidCoordinateRecords };
  }

  private async peek(offset = 0): Promise<Token | undefined> {
    while (this.buffer.length <= offset) {
      const token = await this.tokenizer.next();
      if (!token) return undefined;
      this.buffer.push(token);
    }
    return this.buffer[offset];
  }

  private async take(): Promise<Token | undefined> {
    const token = await this.peek();
    if (token) this.buffer.shift();
    return token;
  }

  private async expect(value: string, message: string): Promise<void> {
    if ((await this.take())?.value !== value) throw new Error(message);
  }

  private async takeId(message: string): Promise<Token> {
    const token = await this.take();
    if (!token || token.kind !== "id") throw new Error(message);
    return token;
  }

  private async parseStatements(): Promise<void> {
    while (await this.peek()) {
      const token = (await this.peek())!;
      if (token.value === "}") { await this.take(); return; }
      if (token.value === ";" || token.value === ",") { await this.take(); continue; }
      if (token.value === "{") { await this.take(); await this.parseStatements(); continue; }
      if (token.kind !== "id") throw new Error(`Unexpected ${token.value} in DOT statement`);
      await this.parseStatement();
    }
    throw new Error("Unterminated DOT graph or subgraph");
  }

  private async parseStatement(): Promise<void> {
    const first = await this.takeId("Expected DOT statement");
    const keyword = first.value.toLowerCase();
    if (keyword === "subgraph") {
      if ((await this.peek())?.value !== "{") await this.takeId("Expected subgraph name or opening brace");
      await this.expect("{", "Expected opening brace for DOT subgraph");
      await this.parseStatements();
      return;
    }
    if (["graph", "node", "edge"].includes(keyword) && (await this.peek())?.value === "[") {
      await this.parseAttributeLists();
      return;
    }
    if ((await this.peek())?.value === "=") {
      await this.take();
      await this.takeId("Expected value in DOT assignment");
      return;
    }

    const identifiers = [first.value];
    await this.skipPort();
    let edgeStatement = false;
    while ((await this.peek())?.kind === "edge") {
      edgeStatement = true;
      await this.take();
      if ((await this.peek())?.value === "{") {
        await this.take();
        await this.parseStatements();
      } else {
        await this.takeId("Expected edge endpoint in DOT statement");
        await this.skipPort();
      }
      if ((await this.peek())?.kind !== "edge") break;
    }
    if (edgeStatement) {
      await this.parseAttributeLists();
      return;
    }

    while ((await this.peek())?.value === ",") {
      await this.take();
      if ((await this.peek())?.kind !== "id") break;
      identifiers.push((await this.takeId("Expected node identifier")).value);
      await this.skipPort();
    }
    const attributes = await this.parseAttributeLists();
    if (!attributes.length) return;
    for (const identifier of identifiers) this.mergeCoordinates(identifier, attributes);
  }

  private async skipPort(): Promise<void> {
    while ((await this.peek())?.value === ":") {
      await this.take();
      if ((await this.peek())?.kind === "id") await this.take();
    }
  }

  private async parseAttributeLists(): Promise<Array<[string, string]>> {
    const attributes: Array<[string, string]> = [];
    while ((await this.peek())?.value === "[") {
      await this.take();
      while (await this.peek() && (await this.peek())?.value !== "]") {
        if ([";", ","].includes((await this.peek())!.value)) { await this.take(); continue; }
        const key = (await this.takeId("Expected attribute name in DOT list")).value;
        await this.expect("=", "Expected '=' after DOT attribute name");
        const value = (await this.takeId("Expected attribute value in DOT list")).value;
        let combined = value;
        if (key.toLowerCase() === "pos" && (await this.peek())?.value === "," && (await this.peek(1))?.kind === "id") {
          await this.take();
          combined += `,${(await this.takeId("Expected y coordinate in pos attribute")).value}`;
        }
        if (key.toLowerCase() === "pos" && (await this.peek())?.value === "!") {
          combined += "!";
          await this.take();
        }
        attributes.push([key.toLowerCase(), combined]);
      }
      await this.expect("]", "Unterminated DOT attribute list");
    }
    return attributes;
  }

  private mergeCoordinates(identifier: string, attributes: Array<[string, string]>): void {
    let state = this.coordinates.get(identifier);
    if (!state) { state = { touched: false }; this.coordinates.set(identifier, state); }
    for (const [key, value] of attributes) {
      if (key === "x") { state.x = value; state.touched = true; }
      else if (key === "y") { state.y = value; state.touched = true; }
      else if (key === "pos") { state.pos = value; state.touched = true; }
    }
  }

  private number(value: string): number | null {
    if (!isNumber(value)) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parsePosition(value?: string): DotCoordinate | null {
    if (!value) return null;
    const trimmed = value.trim().replace(/!$/, "").trim();
    const comma = trimmed.indexOf(",");
    if (comma < 0 || trimmed.indexOf(",", comma + 1) >= 0) return null;
    const x = this.number(trimmed.slice(0, comma).trim());
    const y = this.number(trimmed.slice(comma + 1).trim());
    return x === null || y === null ? null : { x, y };
  }
}

export async function parseDotCoordinates(source: string,
  checkpoint: () => Promise<void> = async () => {}): Promise<ParsedDotEmbedding> {
  return new CoordinateParser(source, checkpoint).parse();
}
