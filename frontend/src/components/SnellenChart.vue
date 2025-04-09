// File: src/components/SnellenChart.vue
<template>
  <div class="snellen-chart">
    <div 
      v-for="(line, index) in chartData" 
      :key="index"
      class="chart-line"
      :class="{ 'active': index === currentLine }"
    >
      <div 
        class="chart-text"
        :style="{ 
          fontSize: `${line.size}px`,
          fontWeight: index === currentLine ? 'bold' : 'normal'
        }"
      >
        {{ line.letters }}
      </div>
      <div class="acuity-indicator">{{ line.acuity }}</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SnellenChart',
  props: {
    currentLine: {
      type: Number,
      default: 0
    },
    chartData: {
      type: Array,
      required: true
    }
  }
}
</script>

<style scoped>
.snellen-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 20px 0;
  padding: 20px;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  width: 100%;
  min-height: 500px;
}

.chart-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 5px 0;
  font-family: 'Arial', sans-serif;
  color: #333;
  transition: all 0.3s ease;
}

.chart-line.active {
  transform: scale(1.05);
}

.chart-text {
  font-family: 'Courier New', monospace;
  letter-spacing: 5px;
}

.acuity-indicator {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
</style>