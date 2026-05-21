import { useState } from "react";
import { AlertTriangle, Check, MoreVertical, Search } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Menu,
  MenuDivider,
  MenuItem,
  MenuSectionLabel,
} from "@/components/ui/menu";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, StatusPill } from "@/components/ui/pill";
import { PlatformGlyph } from "@/components/ui/platform-glyph";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";

export function ComponentLibraryPage() {
  const [segment, setSegment] = useState("all");

  return (
    <main className="mx-auto w-full max-w-6xl">
      <PageHeader
        breadcrumb="Redesign"
        title="Component Library"
        subtitle="Milestone 1 primitives rendered in isolation for implementation checks."
        actions={<Button variant="primary">Primary action</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Buttons and status" padded>
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="primary">Primary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Saving</Button>
            <IconButton icon={MoreVertical} label="More actions" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill status="scheduled" />
            <StatusPill status="queued" />
            <StatusPill status="draft" />
            <StatusPill status="published" />
            <StatusPill status="failed" />
            <StatusPill status="active" />
            <StatusPill status="paused" />
            <StatusPill status="deprecated" />
            <Pill tone="brand" dot>
              Brand
            </Pill>
          </div>
        </Card>

        <Card title="Identity" padded>
          <div className="flex items-center gap-3">
            <Avatar size="sm" name="Clicks Mortar" platform="twitter" />
            <Avatar size="md" name="LinkedIn Page" platform="linkedin" />
            <Avatar size="lg" name="Facebook Page" platform="facebook" />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <PlatformGlyph platform="twitter" />
            <PlatformGlyph platform="linkedin" />
            <PlatformGlyph platform="facebook" />
            <Kbd>⌘ K</Kbd>
          </div>
        </Card>

        <Card title="Forms" padded>
          <div className="grid gap-3">
            <Input
              label="Search"
              placeholder="Search posts"
              icon={Search}
              hint="Matches text, tags, and handles."
            />
            <Textarea
              label="Internal notes"
              placeholder="Add notes for operators"
            />
            <NativeSelect label="Default landing page" defaultValue="dashboard">
              <option value="dashboard">Dashboard</option>
              <option value="posts">Posts</option>
            </NativeSelect>
            <Switch
              label="Spinnable text"
              hint="Show live variants before scheduling."
            />
          </div>
        </Card>

        <Card title="Navigation controls" padded>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Post status"
              value={segment}
              onChange={setSegment}
              options={[
                { value: "all", label: "All" },
                { value: "scheduled", label: "Scheduled" },
                { value: "failed", label: "Failed" },
              ]}
            />
            <Menu
              trigger={
                <Button
                  variant="outline"
                  trailingIcon={<MoreVertical className="h-4 w-4" />}
                >
                  Actions
                </Button>
              }
            >
              <MenuSectionLabel>Publishing</MenuSectionLabel>
              <MenuItem icon={Check}>Retry selected</MenuItem>
              <MenuDivider />
              <MenuItem icon={AlertTriangle} danger>
                Delete selected
              </MenuItem>
            </Menu>
          </div>
        </Card>

        <Card title="Messaging" padded className="lg:col-span-2">
          <div className="grid gap-3 md:grid-cols-3">
            <Banner title="Heads up">This is an informational banner.</Banner>
            <Banner tone="warning" title="Needs attention">
              Review expiring credentials.
            </Banner>
            <Banner tone="danger" title="Publish failed">
              The platform rejected this post.
            </Banner>
          </div>
          <div className="mt-4">
            <EmptyState
              icon={Search}
              title="No matching posts"
              body="Adjust the filters or create a new scheduled post."
              action={<Button variant="primary">New post</Button>}
            />
          </div>
        </Card>
      </div>
    </main>
  );
}
