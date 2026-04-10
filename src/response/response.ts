/**
 * A wrapper class for the standard Fetch `Response` object.
 * Provides a clean interface for accessing body and metadata.
 */
export class HttpResponse {
  private readonly response: Response;

  constructor(res: Response) {
    this.response = res;
  }

  /**
   * Returns true if status code is 200-299
   */
  get ok(): boolean {
    return this.response.ok;
  }

  /**
   * HTTP status code
   */
  get status(): number {
    return this.response.status;
  }

  /**
   * Status description text
   */
  get statusText(): string {
    return this.response.statusText;
  }

  /**
   * Response headers object
   */
  get headers(): Headers {
    return this.response.headers;
  }

  /**
   * Parse the response body as JSON.
   * Developers are expected to verify .ok before calling this.
   */
  async json<T = unknown>(): Promise<T> {
    try {
      return (await this.response.json()) as T;
    } catch (err) {
      if (err instanceof Error) {
        throw new Error(`Failed to parse response as JSON: ${err.message}`);
      }
      throw err;
    }
  }

  /**
   * Parse the response body as plain text
   */
  async text(): Promise<string> {
    return this.response.text();
  }

  /**
   * Parse the response body as a Blob
   */
  async blob(): Promise<Blob> {
    return this.response.blob();
  }

  /**
   * Parse the response body as ArrayBuffer
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer();
  }

  /**
   * Parse the response body as FormData
   */
  async formData(): Promise<FormData> {
    return this.response.formData();
  }

  /**
   * Returns the underlying readable stream when available
   */
  stream(): ReadableStream<Uint8Array> | null {
    return this.response.body;
  }

  /**
   * Get the underlying Fetch API Response object
   */
  get native(): Response {
    return this.response;
  }

  /**
   * Clone the response to allow re-reading the body
   */
  clone(): HttpResponse {
    return new HttpResponse(this.response.clone());
  }
}
