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
}

export interface RankedResults {
  query: string;
  total_results: number;
  results: SearchResultItem[];
  cheapest_in_stock?: SearchResultItem;
  best_value?: SearchResultItem;
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
