export interface SearchResultItem {
  asin: string;
  title: string;
  url: string;
  image?: string;
  price_inr?: number;
  price_display?: string;
  mrp_inr?: number;
  rating?: number;
  review_count?: number;
  prime?: boolean;
  sponsored?: boolean;
  in_stock?: boolean;
  delivery?: string;
  price_history_url: string;
  trusted_rating?: number;
  price_outlier?: true;
}

export interface RankedPicks {
  cheapest_in_stock?: SearchResultItem;
  best_value?: SearchResultItem;
  budget_pick?: SearchResultItem;
  top_rated?: SearchResultItem;
  close_call?: true;
  runner_up?: SearchResultItem;
  frontier?: SearchResultItem[];
  why?: Partial<Record<"best_value" | "budget_pick" | "top_rated" | "runner_up", string>>;
}

export interface RankedResults extends RankedPicks {
  query: string;
  page: number;
  total_results: number;
  returned: number;
  results: SearchResultItem[];
}

export interface ProductDetail {
  asin: string;
  title: string;
  url: string;
  image?: string;
  price_inr?: number;
  price_display?: string;
  mrp_inr?: number;
  discount_percent?: number;
  rating?: number;
  review_count?: number;
  in_stock: boolean;
  availability?: string;
  bullets: string[];
  brand?: string;
  seller?: string;
  delivery?: string;
  price_history_url: string;
}
// by Aditya Raj Singh — https://adityarajsingh.com/
