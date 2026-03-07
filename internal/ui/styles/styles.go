package styles

import (
	"github.com/charmbracelet/lipgloss"
)

// Brand colors
var (
	BrandColor     = lipgloss.Color("#00BFFF") // Deep Sky Blue (Primary)
	SuccessColor   = lipgloss.Color("#10B981") // Emerald Green
	WarningColor   = lipgloss.Color("#EF4444") // Red
	WarnColor      = lipgloss.Color("#F9E2AF") // Amber (non-fatal warnings)
	BgColor        = lipgloss.Color("#1E1E2E") // Dark Charcoal
	SubtleColor    = lipgloss.Color("#6C7086") // Muted text
	BorderColor    = lipgloss.Color("#313244") // Subtle border
	HighlightColor = lipgloss.Color("#89B4FA") // Secondary blue highlight
)

// Base Styles
var (
	Base = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#CDD6F4"))

	// Gutter symbols for borderless layout
	GutterBrand = lipgloss.NewStyle().Foreground(BrandColor).Bold(true)
	GutterSuccess = lipgloss.NewStyle().Foreground(SuccessColor).Bold(true)
	GutterError   = lipgloss.NewStyle().Foreground(WarningColor).Bold(true)
	GutterWarn    = lipgloss.NewStyle().Foreground(WarnColor).Bold(true)

	// Indent body text to align with gutter content
	Indent = lipgloss.NewStyle().MarginLeft(4)

	// Typography
	Title = lipgloss.NewStyle().
		Bold(true).
		Foreground(BrandColor).
		Padding(0, 1)

	Subtitle = lipgloss.NewStyle().
			Foreground(HighlightColor).
			Italic(true)

	Highlight = lipgloss.NewStyle().
			Foreground(BrandColor).
			Bold(true)

	HighlightText = lipgloss.NewStyle().
			Foreground(HighlightColor)

	SuccessText = lipgloss.NewStyle().
			Foreground(SuccessColor)

	Muted = lipgloss.NewStyle().
		Foreground(SubtleColor)

	URLStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#A6E3A1")).
			Underline(true)

	KeyStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F9E2AF")).
			Bold(true)

	BadgeSuccess = lipgloss.NewStyle().
			Background(SuccessColor).
			Foreground(BgColor).
			Bold(true).
			Padding(0, 1).
			MarginRight(1)

	BadgeError = lipgloss.NewStyle().
			Background(WarningColor).
			Foreground(BgColor).
			Bold(true).
			Padding(0, 1).
			MarginRight(1)

	HelpText = Muted.Copy().
			MarginTop(1)
)

// Helper for rendering a branded title block
func RenderTitle(text string) string {
	return lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FFF")).
		Background(BrandColor).
		Padding(0, 1).
		MarginBottom(1).
		Render(text)
}
