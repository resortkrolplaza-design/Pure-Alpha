// =============================================================================
// Group Portal — Error Boundary (catches React render crashes)
// =============================================================================

import { Component, type ReactNode, type ErrorInfo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { group, fontSize, radius, spacing } from "./tokens";
import { Icon } from "./icons";
import { t } from "./i18n";
import type { Lang } from "./i18n";
interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  lang?: Lang;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Error tracking can be added here (e.g. Sentry)
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Icon name="alert-circle-outline" size={40} color={group.textMuted} />
          <Text style={styles.title}>
            {this.props.fallbackMessage ?? t(this.props.lang ?? "pl", "error.fallback")}
          </Text>
          <Pressable
            style={styles.retryBtn}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel={t(this.props.lang ?? "pl", "error.retry")}
          >
            <Text style={styles.retryText}>{t(this.props.lang ?? "pl", "error.retry")}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing["3xl"],
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  retryText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});
