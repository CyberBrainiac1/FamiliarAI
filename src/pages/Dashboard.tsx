import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from '@supabase/supabase-js';
import Card from '../components/ui/Card';
import { dataSupabase, isDataSupabaseConfigured } from '../lib/supabaseData';

type TimeFilter = '24h' | 'week' | 'month' | 'year' | 'all';
type StatusFilter = 'all' | 'recognized' | 'unknown' | 'labeled';
type PeopleSort = 'recent' | 'frequent' | 'name';
type SectionKey = 'overview' | 'met' | 'interactions' | 'alerts' | 'directory';
type InteractionStatus = 'recognized' | 'unknown' | 'labeled';

interface DashboardProps {
  user: User;
  onSignOut: () => void | Promise<void>;
}

interface Person {
  id: string;
  name: string;
  relationship: string;
  pictureUrl?: string;
  lastSeenHoursAgo: number;
  seenCount: number;
  note?: string;
  avatar: string;
}

interface Interaction {
  id: string;
  personId?: string;
  name: string;
  status: InteractionStatus;
  timestampHoursAgo: number;
  thumbnail: string;
}

interface Alert {
  id: string;
  timestampHoursAgo: number;
  imageUrl: string;
  status: 'pending';
}

const HOURS = {
  '24h': 24,
  week: 24 * 7,
  month: 24 * 30,
  year: 24 * 365,
  all: Number.POSITIVE_INFINITY,
} as const;

const peopleSeed: Person[] = [];
const interactionSeed: Interaction[] = [];
const alertSeed: Alert[] = [];

const CARDS_TABLE = import.meta.env.VITE_DATA_TABLE_CARDS || 'cards';
const PEOPLE_TABLE = import.meta.env.VITE_DATA_TABLE_PEOPLE || 'people';
const INTERACTIONS_TABLE = import.meta.env.VITE_DATA_TABLE_INTERACTIONS || 'interactions';

const toHoursAgo = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const diff = (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
      return Math.max(0, diff);
    }
  }
  return fallback;
};

const textOr = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

const toImageSrc = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/')) return raw;
  return `data:image/jpeg;base64,${raw}`;
};

const timeLabel = (hoursAgo: number) => {
  if (hoursAgo < 1) return 'just now';
  if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
  return `${Math.round(hoursAgo / 24)}d ago`;
};

const statusBadgeClass = (status: InteractionStatus) => {
  if (status === 'recognized') return 'badge-recognized';
  if (status === 'labeled') return 'badge-labeled';
  return 'badge-unknown';
};

const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  const [peopleData, setPeopleData] = useState<Person[]>(peopleSeed);
  const [interactionsData, setInteractionsData] = useState<Interaction[]>(interactionSeed);
  const [alertsData, setAlertsData] = useState<Alert[]>(alertSeed);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [peopleTimeFilter, setPeopleTimeFilter] = useState<Exclude<TimeFilter, '24h'>>('week');
  const [peopleSort, setPeopleSort] = useState<PeopleSort>('recent');
  const [interactionTimeFilter, setInteractionTimeFilter] = useState<Extract<TimeFilter, '24h' | 'week' | 'month' | 'all'>>('week');
  const [interactionStatusFilter, setInteractionStatusFilter] = useState<StatusFilter>('all');
  const [alertsTimeFilter, setAlertsTimeFilter] = useState<'today' | '3days' | 'week'>('week');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [topSearch, setTopSearch] = useState('');
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [labelName, setLabelName] = useState('');
  const [labelRelationship, setLabelRelationship] = useState('');
  const [toast, setToast] = useState('');

  const saveAlertLabel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAlert) return;

    const name = labelName.trim();
    const relation = labelRelationship.trim();
    if (!name || !relation) return;

    if (!dataSupabase || !isDataSupabaseConfigured) {
      setToast('Second Supabase is not configured.');
      window.setTimeout(() => setToast(''), 2400);
      return;
    }

    const { error } = await dataSupabase
      .from(CARDS_TABLE)
      .update({ name, relation })
      .eq('id', selectedAlert.id);

    if (error) {
      setToast(`Failed to save: ${error.message}`);
      window.setTimeout(() => setToast(''), 2400);
      return;
    }

    setToast('Details saved.');
    setSelectedAlert(null);
    setLabelName('');
    setLabelRelationship('');
    window.setTimeout(() => setToast(''), 2400);
    await loadSecondSupabaseData();
  };

  const loadSecondSupabaseData = useCallback(async () => {
    if (!dataSupabase || !isDataSupabaseConfigured) {
      setDataError('Second Supabase is not configured. Add VITE_DATA_SUPABASE_URL and VITE_DATA_SUPABASE_ANON_KEY.');
      return;
    }

    setIsDataLoading(true);
    setDataError('');

    try {
      const [peopleRes, interactionsRes, cardsRes] = await Promise.all([
        dataSupabase.from(PEOPLE_TABLE).select('*').order('last_met', { ascending: false }),
        dataSupabase.from(INTERACTIONS_TABLE).select('*').order('met_at', { ascending: false }).limit(500),
        dataSupabase.from(CARDS_TABLE).select('*').order('last_met', { ascending: false }).limit(500),
      ]);

      const errors: string[] = [];
      let mappedPeople: Person[] = [];
      let mappedInteractions: Interaction[] = [];

      if (peopleRes.error) {
        errors.push(`People(${PEOPLE_TABLE}): ${peopleRes.error.message}`);
      } else {
        mappedPeople = (peopleRes.data || []).map((row: Record<string, unknown>, index: number) => {
          const name = textOr(row.name, 'Unknown');
          return {
            id: String(row.id || `p-${index}`),
            name,
            relationship: textOr(row.relation ?? row.relationship, 'Unknown'),
            pictureUrl: toImageSrc(row.picture ?? row.image),
            lastSeenHoursAgo: toHoursAgo(row.last_met ?? row.time ?? row.last_seen ?? row.created_at, 9999),
            seenCount: Number(row.seen_count ?? row.interaction_count ?? 0),
            note: typeof row.note === 'string' ? row.note : undefined,
            avatar: name === 'Unknown' ? 'UN' : name.slice(0, 2).toUpperCase(),
          };
        });
      }

      if (interactionsRes.error) {
        errors.push(`Interactions(${INTERACTIONS_TABLE}): ${interactionsRes.error.message}`);
      } else {
        mappedInteractions = (interactionsRes.data || []).map((row: Record<string, unknown>, index: number) => ({
          id: String(row.id || `i-${index}`),
          personId: row.person_id ? String(row.person_id) : undefined,
          name: textOr(row.name ?? row.person_name, 'Unknown Person'),
          status: (['recognized', 'unknown', 'labeled'].includes(String(row.status))
            ? String(row.status)
            : 'unknown') as InteractionStatus,
          timestampHoursAgo: toHoursAgo(row.met_at ?? row.time ?? row.created_at ?? row.timestamp, 9999),
          thumbnail: textOr(row.thumbnail ?? row.snapshot, '??'),
        }));
      }

      if (cardsRes.error) {
        errors.push(`Cards(${CARDS_TABLE}): ${cardsRes.error.message}`);
      } else {
        const mappedAlerts: Alert[] = (cardsRes.data || [])
          .map((row: Record<string, unknown>, index: number) => ({
            id: String(row.id || `a-${index}`),
            name: textOr(row.name, ''),
            relation: textOr(row.relation, ''),
            imageUrl: toImageSrc(row.picture ?? row.image),
            timestampHoursAgo: toHoursAgo(row.last_met ?? row.time ?? row.created_at, 9999),
          }))
          .filter((row) => !row.name || !row.relation)
          .map((row) => ({
            id: row.id,
            imageUrl: row.imageUrl,
            timestampHoursAgo: row.timestampHoursAgo,
            status: 'pending' as const,
          }));
        setAlertsData(mappedAlerts);
      }

      if (mappedPeople.length) {
        const seenCountByPersonId = mappedInteractions.reduce<Record<string, number>>((acc, item) => {
          if (!item.personId) return acc;
          acc[item.personId] = (acc[item.personId] || 0) + 1;
          return acc;
        }, {});

        const peopleWithCounts = mappedPeople.map((person) => ({
          ...person,
          seenCount: seenCountByPersonId[person.id] || person.seenCount,
        }));
        setPeopleData(peopleWithCounts);
      } else {
        setPeopleData([]);
      }

      setInteractionsData(mappedInteractions);

      if (errors.length) {
        setDataError(errors.join(' | '));
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Failed to load data from second Supabase.');
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecondSupabaseData();
  }, [loadSecondSupabaseData]);

  const filteredPeople = useMemo(() => {
    const maxHours = HOURS[peopleTimeFilter];
    const base = peopleData.filter((person) => person.lastSeenHoursAgo <= maxHours);
    const searched = topSearch
      ? base.filter((person) => `${person.name} ${person.relationship}`.toLowerCase().includes(topSearch.toLowerCase()))
      : base;
    if (peopleSort === 'recent') return [...searched].sort((a, b) => a.lastSeenHoursAgo - b.lastSeenHoursAgo);
    if (peopleSort === 'frequent') return [...searched].sort((a, b) => b.seenCount - a.seenCount);
    return [...searched].sort((a, b) => a.name.localeCompare(b.name));
  }, [peopleData, peopleSort, peopleTimeFilter, topSearch]);

  const filteredInteractions = useMemo(() => {
    const maxHours = HOURS[interactionTimeFilter];
    const byTime = interactionsData.filter((item) => item.timestampHoursAgo <= maxHours);
    const byStatus =
      interactionStatusFilter === 'all'
        ? byTime
        : byTime.filter((item) => item.status === interactionStatusFilter);
    return byStatus;
  }, [interactionStatusFilter, interactionTimeFilter, interactionsData]);

  const filteredAlerts = useMemo(() => {
    const maxHours = alertsTimeFilter === 'today' ? 24 : alertsTimeFilter === '3days' ? 72 : 168;
    return alertsData.filter((alert) => alert.timestampHoursAgo <= maxHours);
  }, [alertsData, alertsTimeFilter]);

  const filteredDirectory = useMemo(() => {
    const query = directoryQuery.trim().toLowerCase();
    if (!query) return peopleData;
    return peopleData.filter((person) =>
      `${person.name} ${person.relationship} ${person.note || ''}`.toLowerCase().includes(query)
    );
  }, [directoryQuery, peopleData]);

  const stats = {
    peopleTracked: peopleData.length,
    pendingAlerts: alertsData.length,
    interactionsRecent: interactionsData.filter((item) => item.timestampHoursAgo <= 24 * 7).length,
  };

  const submitLabel = saveAlertLabel;

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-700 pb-20 md:pb-0">
      <div className="pointer-events-none absolute inset-0">
        <div className="grid-overlay" />
      </div>

      <header className="relative sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Familiar</p>
            <p className="text-lg font-semibold text-slate-900">Caregiver Dashboard</p>
          </div>
          <div className="ml-auto flex w-full items-center gap-2 md:w-auto">
            <input
              type="text"
              placeholder="Search person..."
              value={topSearch}
              onChange={(event) => setTopSearch(event.target.value)}
              className="input-field md:min-w-[220px]"
            />
            <button
              type="button"
              onClick={() => onSignOut()}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-6 md:py-8">
        <section id="overview" className="scroll-mt-24">
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
            Welcome, {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Caregiver'}
          </h1>
          <p className="mt-1 text-slate-600">Monitor familiar faces, unknown alerts, and recent interactions.</p>
          {isDataLoading && (
            <p className="mt-2 text-sm text-slate-500">Loading data from second Supabase...</p>
          )}
          {dataError && (
            <p className="mt-2 text-sm text-amber-700">{dataError}</p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-5">
              <p className="text-sm text-slate-500">Total People Tracked</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{stats.peopleTracked}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">Pending Alerts</p>
              <p className="mt-2 text-3xl font-bold text-slate-700">{stats.pendingAlerts}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">Interactions (Last 7d)</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{stats.interactionsRecent}</p>
            </Card>
          </div>
        </section>

        <section id="met" className="mt-8 scroll-mt-24">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">People You&apos;ve Met</h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={peopleTimeFilter}
                onChange={(event) => setPeopleTimeFilter(event.target.value as Exclude<TimeFilter, '24h'>)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="year">Last Year</option>
                <option value="all">All Time</option>
              </select>
              <select
                value={peopleSort}
                onChange={(event) => setPeopleSort(event.target.value as PeopleSort)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="recent">Most Recent</option>
                <option value="frequent">Most Frequent</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredPeople.length === 0 && (
              <Card className="p-6 text-center md:col-span-2 xl:col-span-3">
                <p className="text-slate-600">No people recognized yet.</p>
              </Card>
            )}
            {filteredPeople.map((person) => (
              <button
                type="button"
                key={person.id}
                onClick={() =>
                  setSelectedInteraction({
                    id: `meta-${person.id}`,
                    personId: person.id,
                    name: person.name,
                    status: 'recognized',
                    timestampHoursAgo: person.lastSeenHoursAgo,
                    thumbnail: person.avatar,
                  })
                }
                className="text-left"
              >
                <Card className="feature-card p-5">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full bg-emerald-100">
                      {person.pictureUrl ? (
                        <img src={person.pictureUrl} alt={person.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-semibold text-emerald-700">
                          {person.avatar}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{person.name || 'Unknown Name'}</p>
                      <p className="text-sm text-slate-500">{person.relationship || 'Unknown Relation'}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-600">Last seen {timeLabel(person.lastSeenHoursAgo)}</p>
                  <p className="text-sm text-slate-500">Seen {person.seenCount} times</p>
                </Card>
              </button>
            ))}
          </div>
        </section>

        <section id="interactions" className="mt-8 scroll-mt-24">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">Recent Interactions</h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={interactionTimeFilter}
                onChange={(event) => setInteractionTimeFilter(event.target.value as typeof interactionTimeFilter)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="24h">Last 24h</option>
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="all">All</option>
              </select>
              <select
                value={interactionStatusFilter}
                onChange={(event) => setInteractionStatusFilter(event.target.value as StatusFilter)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="recognized">Recognized</option>
                <option value="unknown">Unknown</option>
                <option value="labeled">Labeled</option>
              </select>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {filteredInteractions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedInteraction(item)}
                className="w-full text-left"
              >
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                      {item.thumbnail}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-500">{timeLabel(item.timestampHoursAgo)}</p>
                    </div>
                    <span className={statusBadgeClass(item.status)}>
                      {item.status[0].toUpperCase() + item.status.slice(1)}
                    </span>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </section>

        <section id="alerts" className="mt-8 scroll-mt-24">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">Pending Unknown Alerts</h2>
            <div className="ml-auto">
              <select
                value={alertsTimeFilter}
                onChange={(event) => setAlertsTimeFilter(event.target.value as typeof alertsTimeFilter)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="today">Today</option>
                <option value="3days">Last 3 Days</option>
                <option value="week">Last Week</option>
              </select>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredAlerts.map((alert) => (
              <Card key={alert.id} className="p-4">
                <div className="h-24 rounded-lg bg-slate-100 overflow-hidden">
                  {alert.imageUrl ? (
                    <img src={alert.imageUrl} alt="Unknown person" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No image
                    </div>
                  )}
                </div>
                <p className="mt-3 text-sm text-slate-600">{timeLabel(alert.timestampHoursAgo)}</p>
                <span className="badge-unknown mt-2 inline-flex">Pending</span>
                <button
                  type="button"
                  onClick={() => setSelectedAlert(alert)}
                  className="mt-3 w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-500"
                >
                  Label Person
                </button>
              </Card>
            ))}
          </div>
        </section>

        <section id="directory" className="mt-8 scroll-mt-24">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">People Directory</h2>
            <input
              type="text"
              placeholder="Search by name or relationship"
              value={directoryQuery}
              onChange={(event) => setDirectoryQuery(event.target.value)}
              className="input-field ml-auto w-full md:w-80"
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDirectory.map((person) => (
              <Card key={person.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{person.name || 'Unknown Name'}</p>
                    <p className="text-sm text-slate-500">{person.relationship || 'Unknown Relation'}</p>
                  </div>
                  <span className="text-xs text-slate-400">{timeLabel(person.lastSeenHoursAgo)}</span>
                </div>
                {person.note && <p className="mt-3 text-sm text-slate-600">{person.note}</p>}
              </Card>
            ))}
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {[
            { key: 'overview', label: 'Home' },
            { key: 'met', label: 'People' },
            { key: 'interactions', label: 'Events' },
            { key: 'alerts', label: 'Alerts' },
            { key: 'directory', label: 'Directory' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveSection(item.key as SectionKey);
                document.getElementById(item.key)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`rounded-md px-2 py-2 text-xs font-medium ${
                activeSection === item.key ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {selectedInteraction && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-slate-900">Interaction Detail</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-medium text-slate-900">Name:</span> {selectedInteraction.name}</p>
              <p><span className="font-medium text-slate-900">Status:</span> {selectedInteraction.status}</p>
              <p><span className="font-medium text-slate-900">When:</span> {timeLabel(selectedInteraction.timestampHoursAgo)}</p>
              <p><span className="font-medium text-slate-900">Snapshot:</span> {selectedInteraction.thumbnail}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedInteraction(null)}
              className="mt-5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </Card>
        </div>
      )}

      {selectedAlert && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-slate-900">Label Unknown Person</h3>
            <p className="mt-2 text-sm text-slate-600">Alert captured {timeLabel(selectedAlert.timestampHoursAgo)}.</p>
            <form onSubmit={submitLabel} className="mt-4 space-y-3">
              <input
                type="text"
                className="input-field"
                placeholder="Person name"
                value={labelName}
                onChange={(event) => setLabelName(event.target.value)}
                required
              />
              <input
                type="text"
                className="input-field"
                placeholder="Relationship"
                value={labelRelationship}
                onChange={(event) => setLabelRelationship(event.target.value)}
                required
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-500"
              >
                Save Label
              </button>
            </form>
            <button
              type="button"
              onClick={() => setSelectedAlert(null)}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </Card>
        </div>
      )}

      {toast && (
        <div className="fixed right-4 top-20 z-40 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
