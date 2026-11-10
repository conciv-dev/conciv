import react from '@vitejs/plugin-react'

export default {
  plugins: [react()],
  build: {rolldownOptions: {input: {main: 'main.tsx'}}},
}
