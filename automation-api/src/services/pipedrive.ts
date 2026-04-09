import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import logger from '../utils/logger';
import { PipedriveError } from '../utils/errors';
import type {
  PipedriveResponse,
  Person,
  CreatePersonInput,
  Lead,
  CreateLeadInput,
  Note,
  Deal,
  MailMessage,
  DealProduct,
  ProductUpdate,
  Activity,
  CreateActivityInput,
  PipedriveFile,
  SearchResult,
} from '../types/pipedrive';
import FormData from 'form-data';

const BASE_URL = `https://${config.pipedrive.companyDomain}.pipedrive.com/api/v1`;

class PipedriveClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      params: { api_token: config.pipedrive.apiToken },
      timeout: 30000,
    });

    this.client.interceptors.response.use(undefined, (error: AxiosError) => {
      const status = error.response?.status;
      const data = error.response?.data;
      logger.error({ status, data, url: error.config?.url }, 'Pipedrive API error');

      if (status === 429) {
        throw new PipedriveError('Rate limit exceeded', error);
      }
      throw new PipedriveError(
        `API call failed: ${error.message}`,
        error,
      );
    });
  }

  // ── Persons ──

  async searchPersons(email: string): Promise<Person[]> {
    const res = await this.client.get<PipedriveResponse<SearchResult>>('/persons/search', {
      params: { term: email, fields: 'email', limit: 5 },
    });
    if (!res.data.data?.items) return [];
    return res.data.data.items.map((i) => i.item);
  }

  async createPerson(data: CreatePersonInput): Promise<Person> {
    const res = await this.client.post<PipedriveResponse<Person>>('/persons', data);
    return res.data.data;
  }

  async updatePerson(id: number, data: Partial<Person>): Promise<Person> {
    const res = await this.client.put<PipedriveResponse<Person>>(`/persons/${id}`, data);
    return res.data.data;
  }

  // ── Leads ──

  async createLead(data: CreateLeadInput): Promise<Lead> {
    const res = await this.client.post<PipedriveResponse<Lead>>('/leads', data);
    return res.data.data;
  }

  // ── Notes ──

  async createNote(content: string, opts: { lead_id?: string; deal_id?: number }): Promise<Note> {
    const res = await this.client.post<PipedriveResponse<Note>>('/notes', {
      content,
      ...opts,
    });
    return res.data.data;
  }

  // ── Deals ──

  async getDeal(id: number): Promise<Deal> {
    const res = await this.client.get<PipedriveResponse<Deal>>(`/deals/${id}`);
    return res.data.data;
  }

  async updateDeal(id: number, data: Partial<Deal>): Promise<Deal> {
    const res = await this.client.put<PipedriveResponse<Deal>>(`/deals/${id}`, data);
    return res.data.data;
  }

  async getDealsForPerson(personId: number, status: string = 'open'): Promise<Deal[]> {
    const res = await this.client.get<PipedriveResponse<Deal[]>>(`/persons/${personId}/deals`, {
      params: { status, limit: 10 },
    });
    return res.data.data || [];
  }

  async getDealMailMessages(dealId: number): Promise<MailMessage[]> {
    const res = await this.client.get<PipedriveResponse<MailMessage[]>>(
      `/deals/${dealId}/mailMessages`,
    );
    return res.data.data || [];
  }

  // ── Products ──

  async listProductsInDeal(dealId: number): Promise<DealProduct[]> {
    const res = await this.client.get<PipedriveResponse<DealProduct[]>>(
      `/deals/${dealId}/products`,
    );
    return res.data.data || [];
  }

  async updateProductInDeal(
    dealId: number,
    productAttachmentId: number,
    data: ProductUpdate,
  ): Promise<void> {
    await this.client.put(
      `/deals/${dealId}/products/${productAttachmentId}`,
      data,
    );
  }

  // ── Activities ──

  async getActivitiesForDeal(dealId: number): Promise<Activity[]> {
    const res = await this.client.get<PipedriveResponse<Activity[]>>('/activities', {
      params: { deal_id: dealId, limit: 100 },
    });
    return res.data.data || [];
  }

  async createActivity(data: CreateActivityInput): Promise<Activity> {
    const res = await this.client.post<PipedriveResponse<Activity>>('/activities', data);
    return res.data.data;
  }

  async updateActivity(id: number, data: Partial<Activity>): Promise<Activity> {
    const res = await this.client.put<PipedriveResponse<Activity>>(`/activities/${id}`, data);
    return res.data.data;
  }

  // ── Files ──

  async listDealFiles(dealId: number): Promise<PipedriveFile[]> {
    const res = await this.client.get<PipedriveResponse<PipedriveFile[]>>(
      `/deals/${dealId}/files`,
    );
    return res.data.data || [];
  }

  async downloadFile(fileId: number): Promise<Buffer> {
    const res = await this.client.get(`/files/${fileId}/download`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data);
  }

  async uploadFile(dealId: number, fileName: string, data: Buffer): Promise<PipedriveFile> {
    const form = new FormData();
    form.append('file', data, { filename: `${fileName}.pdf`, contentType: 'application/pdf' });
    form.append('deal_id', dealId.toString());

    const res = await this.client.post<PipedriveResponse<PipedriveFile>>('/files', form, {
      headers: form.getHeaders(),
    });
    return res.data.data;
  }
}

export const pipedrive = new PipedriveClient();
