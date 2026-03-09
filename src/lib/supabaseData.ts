import { createClient, SupabaseClient } from '@supabase/supabase-js';

const dataSupabaseUrl = import.meta.env.VITE_DATA_SUPABASE_URL;
const dataSupabaseAnonKey = import.meta.env.VITE_DATA_SUPABASE_ANON_KEY;

export const isDataSupabaseConfigured = Boolean(dataSupabaseUrl && dataSupabaseAnonKey);

export const dataSupabase = isDataSupabaseConfigured
  ? createClient(dataSupabaseUrl as string, dataSupabaseAnonKey as string)
  : null;

export const dataTableNames = {
  cards: import.meta.env.VITE_DATA_TABLE_CARDS || 'cards',
  peopleMet: import.meta.env.VITE_DATA_TABLE_PEOPLE || 'people_met',
  interactions: import.meta.env.VITE_DATA_TABLE_INTERACTIONS || 'interactions',
} as const;

type DataRow = Record<string, unknown>;
type DataError = { message: string };

export interface SaveLabeledPersonPayload {
  userId: string;
  cardId: string;
  name: string;
  relation: string;
}

const missingConfigMessage =
  'Data service is not configured. Please contact the administrator.';

const getClient = (): SupabaseClient | null => {
  if (!isDataSupabaseConfigured || !dataSupabase) return null;
  return dataSupabase;
};

const withMissingClient = <T>(fallbackData: T) => ({
  data: fallbackData,
  error: { message: missingConfigMessage } as DataError,
});

const toDataError = (error: { message: string } | null): DataError | null =>
  error ? { message: error.message } : null;

export const fetchPeopleMetByUser = async (userId: string, limit = 500) => {
  const client = getClient();
  if (!client) return withMissingClient<DataRow[] | null>(null);

  const { data, error } = await client
    .from(dataTableNames.peopleMet)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return {
    data: data as DataRow[] | null,
    error: toDataError(error),
  };
};

export const fetchInteractionsByUser = async (userId: string, limit = 500) => {
  const client = getClient();
  if (!client) return withMissingClient<DataRow[] | null>(null);

  const { data, error } = await client
    .from(dataTableNames.interactions)
    .select('*')
    .eq('user_id', userId)
    .order('met_at', { ascending: false })
    .limit(limit);

  return {
    data: data as DataRow[] | null,
    error: toDataError(error),
  };
};

export const fetchCardsByUser = async (userId: string, limit = 500) => {
  const client = getClient();
  if (!client) return withMissingClient<DataRow[] | null>(null);

  const { data, error } = await client
    .from(dataTableNames.cards)
    .select('*')
    .eq('user_id', userId)
    .order('last_met', { ascending: false })
    .limit(limit);

  return {
    data: data as DataRow[] | null,
    error: toDataError(error),
  };
};

export const saveLabeledPerson = async ({
  userId,
  cardId,
  name,
  relation,
}: SaveLabeledPersonPayload) => {
  const client = getClient();
  if (!client) return withMissingClient<DataRow | null>(null);

  const { data, error } = await client
    .from(dataTableNames.peopleMet)
    .upsert({
      user_id: userId,
      card_id: cardId,
      name,
      relation,
    }, { onConflict: 'user_id,card_id' })
    .select('*')
    .single();

  return {
    data: (data as DataRow | null) ?? null,
    error: toDataError(error),
  };
};

export const deleteLabeledPersonById = async (personId: string, userId: string) => {
  const client = getClient();
  if (!client) return withMissingClient<DataRow | null>(null);

  const { error } = await client
    .from(dataTableNames.peopleMet)
    .delete()
    .eq('id', personId)
    .eq('user_id', userId);

  return {
    data: null,
    error: toDataError(error),
  };
};
