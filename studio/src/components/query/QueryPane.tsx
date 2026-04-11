import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryResults, useChat } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";

export function QueryPane() {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [useAi, setUseAi] = useState(false);
  const { apiUrl, currentDb, currentCollection } = useAppStore();

  const queryResult = useQueryResults(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? "",
    submitted,
    { enabled: !!submitted && !useAi }
  );
  const chatResult = useChat(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? "",
    submitted,
    { enabled: !!submitted && useAi }
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) setSubmitted(text.trim());
  }

  const results = useAi
    ? (chatResult.data?.sources ?? [])
    : (queryResult.data ?? []);
  const isLoading = useAi ? chatResult.isLoading : queryResult.isLoading;
  const error = useAi ? chatResult.error : queryResult.error;

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1"
          aria-label="Query input"
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Searching…" : "Search"}
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <Switch
          id="ai-toggle"
          checked={useAi}
          onCheckedChange={setUseAi}
          aria-label="AI answer toggle"
        />
        <Label htmlFor="ai-toggle">AI answer</Label>
      </div>

      {error && (
        <div
          className="text-destructive text-sm p-3 border border-destructive rounded"
          role="alert"
        >
          {error.message}
        </div>
      )}

      {useAi && chatResult.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Answer</CardTitle>
            <Badge variant="secondary" className="w-fit text-xs">
              {chatResult.data.provider} / {chatResult.data.model}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {chatResult.data.answer}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && submitted && results.length === 0 && !error && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <Card key={`${r.source}-${r.chunk}`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {r.score.toFixed(3)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.source}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    chunk {r.chunk}
                  </span>
                </div>
                <p className="text-sm">{r.text.slice(0, 200)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
