import type { User } from '../../../hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

interface SecuritySectionProps {
  user: User;
}

// Placeholder -- replaced in Task 2
export function SecuritySection({ user: _user }: SecuritySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Security</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Loading security settings...</p>
      </CardContent>
    </Card>
  );
}
