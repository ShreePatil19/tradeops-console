// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/agents/empty-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(
      <EmptyState
        icon={<BookOpen className="size-6" data-testid="icon" />}
        title="No data yet"
        description="Submit something to start"
      />
    );
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(
      <EmptyState
        icon={<BookOpen className="size-6" />}
        title="No data yet"
        description="Submit something to start"
      />
    );
    expect(screen.getByText("Submit something to start")).toBeInTheDocument();
  });

  it("renders the icon", () => {
    render(
      <EmptyState
        icon={<BookOpen className="size-6" data-testid="icon" />}
        title="No data yet"
        description="Submit something to start"
      />
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders the cta when provided", () => {
    render(
      <EmptyState
        icon={<BookOpen className="size-6" />}
        title="No data yet"
        description="Submit something to start"
        cta="Try a sample on the left"
      />
    );
    expect(screen.getByText("Try a sample on the left")).toBeInTheDocument();
  });

  it("does not render cta block when not provided", () => {
    const { container } = render(
      <EmptyState
        icon={<BookOpen className="size-6" />}
        title="No data yet"
        description="Submit something to start"
      />
    );
    const italicParagraphs = container.querySelectorAll("p.italic");
    expect(italicParagraphs.length).toBe(0);
  });
});
