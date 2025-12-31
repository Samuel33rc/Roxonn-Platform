import { STAGING_API_URL } from '../config';

interface CsrfResponse {
  csrfToken: string;
}

/**
 * Service for managing CSRF tokens
 */
class CsrfService {
  private token: string | null = null;
  private tokenFetchedAt: number | null = null;
  private readonly TOKEN_LIFETIME = 23 * 60 * 60 * 1000; // 23 hours (less than server session)

  /**
   * Fetch a new CSRF token from the server
   */
  async fetchToken(): Promise<string> {
    try {
      const response = await fetch(`${STAGING_API_URL}/api/auth/csrf-token`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch CSRF token: ${response.status}`);
      }

      const data = await response.json() as CsrfResponse;
      this.token = data.csrfToken;
      this.tokenFetchedAt = Date.now();
      return this.token;
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      throw error;
    }
  }

  /**
   * Check if the cached token is still valid
   */
  private isTokenExpired(): boolean {
    if (!this.tokenFetchedAt) return true;
    return (Date.now() - this.tokenFetchedAt) > this.TOKEN_LIFETIME;
  }

  /**
   * Get the current CSRF token, fetching a new one if necessary or expired
   */
  async getToken(): Promise<string> {
    if (!this.token || this.isTokenExpired()) {
      return this.fetchToken();
    }
    return this.token;
  }
  
  /**
   * Clear the stored CSRF token and timestamp
   */
  clearToken(): void {
    this.token = null;
    this.tokenFetchedAt = null;
  }

  /**
   * Force refresh the CSRF token (useful after CSRF errors)
   */
  async refreshToken(): Promise<string> {
    this.clearToken();
    return this.fetchToken();
  }
  
  /**
   * Add CSRF token to an existing headers object
   */
  async addTokenToHeaders(headers: HeadersInit = {}): Promise<Headers> {
    const token = await this.getToken();
    const headersObj = new Headers(headers);
    headersObj.set('X-CSRF-Token', token);
    return headersObj;
  }
  
  /**
   * Add CSRF token to a request body object
   */
  async addTokenToBody(body: Record<string, any> = {}): Promise<Record<string, any>> {
    const token = await this.getToken();
    return {
      ...body,
      _csrf: token
    };
  }
}

// Export a singleton instance
const csrfService = new CsrfService();
export default csrfService; 