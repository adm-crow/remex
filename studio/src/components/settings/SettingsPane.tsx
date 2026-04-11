import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app";

export function SettingsPane() {
  const { apiUrl, setApiUrl, setCurrentDb, setCurrentCollection } =
    useAppStore();
  const [localApiUrl, setLocalApiUrl] = useState(apiUrl);

  function handleSave(e: FormEvent) {
    e.preventDefault();
    setApiUrl(localApiUrl.trim() || "http://localhost:8000");
  }

  function handleChangeProject() {
    setCurrentDb(null);
    setCurrentCollection(null);
  }

  return (
    <div className="p-6 max-w-md space-y-6">
      <h2 className="font-semibold">Settings</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="api-url">API URL</Label>
          <Input
            id="api-url"
            value={localApiUrl}
            onChange={(e) => setLocalApiUrl(e.target.value)}
            placeholder="http://localhost:8000"
            aria-label="API URL"
          />
        </div>
        <Button type="submit" aria-label="Save">
          Save
        </Button>
      </form>
      <div>
        <Button
          variant="outline"
          onClick={handleChangeProject}
          aria-label="Change project"
        >
          Change project
        </Button>
      </div>
    </div>
  );
}
