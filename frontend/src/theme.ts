import { createTheme } from '@mui/material/styles';

// Theme mirrors the palette in `index.css` so MUI components blend with the
// existing CSS-variable-driven styling. Light/dark are picked by MUI from the
// user's OS preference (matches the `@media (prefers-color-scheme: dark)` block
// in `index.css`).
const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        mode: 'light',
        primary: { main: '#5b7f67' },
        background: { default: '#f7f4ee', paper: '#eee9df' },
        text: { primary: '#2c3531', secondary: '#4a5550' },
        divider: '#ddd5c8',
        error: { main: '#c0392b' },
        success: { main: '#3a7d44' },
        warning: { main: '#b79538' },
      },
    },
    dark: {
      palette: {
        mode: 'dark',
        primary: { main: '#7daa86' },
        background: { default: '#151c17', paper: '#1e2822' },
        text: { primary: '#e4e0d7', secondary: '#b8b3a8' },
        divider: '#2f3d34',
        error: { main: '#e07065' },
        success: { main: '#6bc275' },
        warning: { main: '#d2b45a' },
      },
    },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiBackdrop: {
      styleOverrides: {
        invisible: {
          backgroundColor: 'transparent',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
        },
      },
    },
    MuiMenu: {
      defaultProps: {
        transitionDuration: 150,
      },
      styleOverrides: {
        paper: {
          borderRadius: '0.6rem !important',
          minWidth: 120,
        },
        list: {
          padding: '0.25rem',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.82rem',
          borderRadius: '0.4rem',
          padding: '0.45rem 0.65rem',
          '&:hover': {
            backgroundColor: 'var(--accent-subtle)',
          },
          '&.Mui-selected': {
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            fontWeight: 600,
            '&:hover': {
              backgroundColor: 'var(--accent-subtle)',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: 'var(--muted)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--border)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--accent)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--accent)',
            borderWidth: '1px',
          },
        },
        input: {
          color: 'var(--fg)',
          '&::placeholder': {
            color: 'var(--muted)',
            opacity: 1,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          border: '1px solid var(--border)',
        },
      },
    },
  },
});

export default theme;
