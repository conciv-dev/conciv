type ThemeOptions = {components: Record<string, {styleOverrides: Record<string, Record<string, string>>}>}

function createTheme(options: ThemeOptions): ThemeOptions {
  return options
}

export const softTheme = createTheme({components: {MuiPaper: {styleOverrides: {root: {backgroundColor: '#fff'}}}}})
