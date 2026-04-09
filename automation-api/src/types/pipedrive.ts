/** Generic Pipedrive API response wrapper */
export interface PipedriveResponse<T> {
  success: boolean;
  data: T;
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
    };
  };
}

export interface Person {
  id: number;
  name: string;
  email: Array<{ value: string; primary: boolean }>;
  phone: Array<{ value: string; primary: boolean }>;
  owner_id: number;
  [key: string]: unknown;
}

export interface CreatePersonInput {
  name: string;
  email?: Array<{ value: string; primary: boolean }>;
  phone?: Array<{ value: string; primary: boolean }>;
  owner_id?: number;
  [key: string]: unknown;
}

export interface Lead {
  id: string;
  title: string;
  person_id: number;
  owner_id: number;
  [key: string]: unknown;
}

export interface CreateLeadInput {
  title: string;
  person_id?: number;
  owner_id?: number;
  [key: string]: unknown;
}

export interface Note {
  id: number;
  content: string;
  lead_id?: string;
  deal_id?: number;
  [key: string]: unknown;
}

export interface Deal {
  id: number;
  title: string;
  stage_id: number;
  person_id: number;
  org_id: number | null;
  owner_id: number;
  [key: string]: unknown;
}

export interface MailMessage {
  id: number;
  from: Array<{ email_address: string; name: string }>;
  to: Array<{ email_address: string; name: string }>;
  subject: string;
  snippet: string;
  body: string;
  [key: string]: unknown;
}

export interface DealProduct {
  id: number;
  product_id: number;
  deal_id: number;
  name: string;
  item_price: number;
  quantity: number;
  tax: number;
  tax_method: string;
  [key: string]: unknown;
}

export interface ProductUpdate {
  tax: number;
  tax_method: string;
  item_price?: number;
  quantity?: number;
}

export interface Activity {
  id: number;
  subject: string;
  type: string;
  done: boolean;
  due_date: string;
  due_time: string;
  deal_id: number;
  user_id: number;
  note: string;
  location: string;
  [key: string]: unknown;
}

export interface CreateActivityInput {
  subject: string;
  type: string;
  due_date: string;
  due_time?: string;
  user_id?: number;
  deal_id?: number;
  person_id?: number;
  note?: string;
  [key: string]: unknown;
}

export interface PipedriveFile {
  id: number;
  name: string;
  file_name: string;
  deal_id: number;
  url: string;
  [key: string]: unknown;
}

export interface SearchResult {
  items: Array<{
    item: Person;
    result_score: number;
  }>;
}
