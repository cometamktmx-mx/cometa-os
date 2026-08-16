export type ResolvedBrand = {
  id: string | null;
  slug: string;
  name: string;
  industry: string;
  city: string | null;
  sourceTable: string | null;
  matchedBy: string;
  exists: boolean;
};

type ResolveBrandInput = {
  brandSlug?: string | null;
  brandName?: string | null;
};

type TableConfig = {
  table: string;
  slugColumns: string[];
  nameColumns: string[];
  industryColumns: string[];
  cityColumns: string[];
};

const tableConfigs: TableConfig[] = [
  {
    table: "brands",
    slugColumns: ["slug"],
    nameColumns: ["name"],
    industryColumns: [],
    cityColumns: [],
  },
  {
    table: "clients",
    slugColumns: ["brand_slug", "slug", "client_slug"],
    nameColumns: ["brand_name", "name", "client_name", "business_name"],
    industryColumns: ["industry", "business_type", "category"],
    cityColumns: ["city", "location"],
  },
  {
    table: "brand_analysis",
    slugColumns: ["brand_slug", "slug"],
    nameColumns: ["brand_name", "name"],
    industryColumns: ["industry"],
    cityColumns: ["city"],
  },
  {
    table: "cosmos_memory",
    slugColumns: ["brand_slug", "slug"],
    nameColumns: ["brand_name"],
    industryColumns: ["industry"],
    cityColumns: ["city"],
  },
];

export async function resolveBrandFromSupabase(
  supabase: any,
  input: ResolveBrandInput
): Promise<ResolvedBrand> {
  const requestedSlug = cleanText(input.brandSlug);
  const requestedName = cleanText(input.brandName);

  const fallbackName =
    requestedName || formatBrandName(requestedSlug || "marca-demo");

  const fallbackSlug = requestedSlug || slugifyBrand(fallbackName);

  for (const config of tableConfigs) {
    const bySlug = await findBySlugColumns(supabase, config, fallbackSlug);

    if (bySlug) {
      return normalizeBrandRow(bySlug, config, fallbackSlug, "slug");
    }
  }

  if (requestedName) {
    for (const config of tableConfigs) {
      const byName = await findByNameColumns(supabase, config, requestedName);

      if (byName) {
        return normalizeBrandRow(byName, config, fallbackSlug, "name");
      }
    }
  }

  for (const config of tableConfigs) {
    const byComputedSlug = await findByComputedSlug(
      supabase,
      config,
      fallbackSlug
    );

    if (byComputedSlug) {
      return normalizeBrandRow(
        byComputedSlug,
        config,
        fallbackSlug,
        "computed_slug"
      );
    }
  }

  return {
    id: null,
    slug: fallbackSlug,
    name: fallbackName,
    industry: "Sistema comercial",
    city: null,
    sourceTable: null,
    matchedBy: "fallback",
    exists: false,
  };
}

async function findBySlugColumns(
  supabase: any,
  config: TableConfig,
  slug: string
) {
  for (const column of config.slugColumns) {
    const row = await safeFindOne(supabase, config.table, column, slug);

    if (row) return row;
  }

  return null;
}

async function findByNameColumns(
  supabase: any,
  config: TableConfig,
  name: string
) {
  for (const column of config.nameColumns) {
    const row = await safeFindOne(supabase, config.table, column, name);

    if (row) return row;
  }

  return null;
}

async function findByComputedSlug(
  supabase: any,
  config: TableConfig,
  slug: string
) {
  try {
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .limit(500);

    if (error || !Array.isArray(data)) return null;

    return (
      data.find((row: any) => {
        const rowSlug = getFirstValue(row, config.slugColumns);
        const rowName = getFirstValue(row, config.nameColumns);

        if (rowSlug && slugifyBrand(rowSlug) === slug) return true;
        if (rowName && slugifyBrand(rowName) === slug) return true;

        return false;
      }) || null
    );
  } catch {
    return null;
  }
}

async function safeFindOne(
  supabase: any,
  table: string,
  column: string,
  value: string
) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (error) return null;

    return data || null;
  } catch {
    return null;
  }
}

function normalizeBrandRow(
  row: any,
  config: TableConfig,
  fallbackSlug: string,
  matchedBy: string
): ResolvedBrand {
  const name =
    getFirstValue(row, config.nameColumns) ||
    getFirstValue(row, ["brandName"]) ||
    formatBrandName(fallbackSlug);

  const slug =
    getFirstValue(row, config.slugColumns) ||
    getFirstValue(row, ["brandSlug"]) ||
    slugifyBrand(name);

  const industry =
    getFirstValue(row, config.industryColumns) || "Sistema comercial";

  const city = getFirstValue(row, config.cityColumns) || null;

  return {
    id: String(row.id || row.client_id || row.brand_analysis_id || "") || null,
    slug: slugifyBrand(slug),
    name,
    industry,
    city,
    sourceTable: config.table,
    matchedBy,
    exists: true,
  };
}

function getFirstValue(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function cleanText(value?: string | null) {
  if (!value) return "";

  return String(value).trim();
}

export function slugifyBrand(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatBrandName(slug: string) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((word) => {
      const upperCases: Record<string, string> = {
        lr: "LR",
        ai: "AI",
        os: "OS",
      };

      if (upperCases[word]) return upperCases[word];

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}
