module.exports = {
  apps: [
    {
      name: 'qnd-health',
      cwd: __dirname,
      script: 'apps/api/dist/src/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      time: true,
      merge_logs: true,
      out_file: 'logs/qnd-health.log',
      error_file: 'logs/qnd-health-error.log',
    },
  ],
};
