import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import "./ReviewErrorBoundary.css";

interface Props {
  children: ReactNode;
  title: string;
  resetKey?: string | number | null;
}

interface State {
  failed: boolean;
}

export class ReviewErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ReviewErrorBoundary] review surface failed:", error, {
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(previousProps: Props): void {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <section className="review-error" role="alert">
        <strong>{this.props.title}</strong>
        <span>
          Your document is safe. Retry this view to continue reviewing.
        </span>
        <button onClick={() => this.setState({ failed: false })}>Retry</button>
      </section>
    );
  }
}
