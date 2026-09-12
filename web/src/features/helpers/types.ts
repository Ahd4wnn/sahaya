export type Shift = "morning" | "afternoon" | "evening" | "full_day";
export type CutoutStatus = "pending" | "done" | "failed";

export interface Skill {
  slug: string;
  name: string;
  name_ml: string;
}

export interface Service extends Skill {
  icon: string;
  /** Whether this service earns a slot in the site header. Admin-managed. */
  show_in_nav: boolean;
  /** The header's wording, already resolved server-side ("Care Taker"). */
  nav_label: string;
}

export interface HelperCardData {
  id: string;
  full_name: string;
  service: string | null;
  service_name: string | null;
  headline: string;
  skills: Skill[];
  experience_years: number;
  wage_monthly_min: number;
  wage_monthly_max: number;
  shifts: Shift[];
  hours_per_day: number;
  willing_to_live_in: boolean;
  languages: string[];
  district: string | null;
  district_name: string | null;
  town: string | null;
  town_name: string | null;
  photo_url: string | null;
  cutout_url: string | null;
  cutout_status: CutoutStatus;
  id_verified: boolean;
  police_verified: boolean;
  rating_avg: number | null;
  rating_count: number;
}

export interface HelperDetailData extends HelperCardData {
  bio: string;
  landmark: string;
  is_listed: boolean;
}

export interface BrowseResponse {
  items: HelperCardData[];
  total: number;
  limit: number;
  offset: number;
}

export interface BrowseFilters {
  district?: string;
  town?: string;
  service?: string;
  skills?: string[];
  live_in?: boolean;
  shift?: Shift;
  wage_max?: number;
  q?: string;
  sort?: "rating" | "wage_low" | "wage_high" | "newest";
  limit?: number;
  offset?: number;
}

export interface District {
  slug: string;
  name: string;
  name_ml: string;
}

export interface Town extends District {
  is_major: boolean;
  district: string;
}

export interface Taxonomy {
  services: Service[];
  skills: Skill[];
}
