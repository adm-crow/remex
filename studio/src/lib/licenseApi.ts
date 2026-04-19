import { invoke } from "@tauri-apps/api/core";

export type Tier = "free" | "pro";

export interface LicenseStatus {
  tier:              Tier;
  email:             string | null;
  activated_at:      number | null;
  last_validated_at: number | null;
}

export const licenseApi = {
  activate:          (key: string)    => invoke<LicenseStatus>("license_activate",          { key }),
  status:            ()               => invoke<LicenseStatus>("license_status"),
  deactivate:        ()               => invoke<void>         ("license_deactivate"),
  revalidate:        ()               => invoke<LicenseStatus>("license_revalidate"),
  shouldRevalidate:  ()               => invoke<boolean>      ("license_should_revalidate"),
};
