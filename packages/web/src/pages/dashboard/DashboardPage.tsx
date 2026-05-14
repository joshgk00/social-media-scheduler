import { RateLimitsCard } from '../../components/dashboard/RateLimitsCard';

export default function DashboardPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <RateLimitsCard />
    </main>
  );
}
