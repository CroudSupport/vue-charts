/*!
 * vue-charts v0.0.5
 * (c) 2016 Hayden Bickerton
 * Released under the MIT License.
 */
'use strict';

var _ = require('lodash');
_ = 'default' in _ ? _['default'] : _;

var is_loading = false;
var is_loaded = false;

/*
    This lets us resolve the promise outside the
    promise function itself.
 */
var makeDeferred = function makeDeferred() {
    var resolvePromise = null;
    var rejectPromise = null;

    var promise = new Promise(function (resolve, reject) {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    return {
        promise: promise,
        resolve: resolvePromise,
        reject: rejectPromise
    };
};

// Our main promise
var google_promise = makeDeferred();

var loadCharts = (function (packages, version) {

    // Google only lets you load it once, so we'll only run once.
    if (is_loading || is_loaded) {
        return google_promise.promise;
    }

    is_loading = true;

    var script = document.createElement('script');
    script.setAttribute('src', 'https://www.gstatic.com/charts/loader.js');

    script.onreadystatechange = script.onload = function () {

        // After the 'loader.js' is loaded, load our version and packages
        google.charts.load(version, { packages: packages });

        // After we've loaded Google Charts, resolve our promise
        google.charts.setOnLoadCallback(function () {
            is_loading = false;
            is_loaded = true;
            google_promise.resolve();
        });
    };

    // Insert our script into the DOM
    document.getElementsByTagName('head')[0].appendChild(script);

    return google_promise.promise;
})

var propsBinder = (function (vue, props) {

    /*
      Watch our props. Every time they change, redraw the chart.
     */
    _.each(props, function (_ref, attribute) {
        var type = _ref.type;

        vue.$watch(attribute, function () {
            vue.drawChart();
        }, {
            deep: _.isObject(type)
        });
    });
})

var props = {
    packages: {
        type: Array,
        default: function _default() {
            return ['corechart'];
        }
    },
    version: {
        default: 'current',
        coerce: function coerce(val) {
            // They might pass in an integer, make it a string.
            return _.toString(val);
        }
    },
    chartType: {
        required: true,
        type: String
    },
    columns: {
        required: true,
        type: Array
    },
    rows: {
        type: Array,
        default: function _default() {
            return [];
        }
    },
    options: {
        type: Object,
        default: function _default() {
            return {
                chart: {
                    title: 'Chart Title',
                    subtitle: 'Subtitle'
                },
                hAxis: {
                    title: 'X Label'
                },
                vAxis: {
                    title: 'Y Label'
                },
                width: '400px',
                height: '300px',
                animation: {
                    duration: 500,
                    easing: 'out'
                }
            };
        }
    }
};

var Chart = {
    name: 'vue-chart',
    props: props,
    template: '<div class="vue-chart-container">' + '<div class="vue-chart" id="{{ chartId }}">' + '</div>' + '</div>',
    data: function data() {
        return {
            chart: null,
            /*
                We put the uid in the DOM element so the component can be used multiple
                times in the same view. Otherwise Google Charts will only make one chart.
                 The X is prepended because there must be at least
                1 character in id - https://www.w3.org/TR/html5/dom.html#the-id-attribute
            */
            chartId: 'X' + this._uid,
            wrapper: null,
            dataTable: [],
            hiddenColumns: []
        };
    },
    ready: function ready() {
        var self = this;
        loadCharts(self.packages, self.version).then(self.drawChart).then(function () {

            // we con't want to bind props because it's a kind of "computed" property
            var boundProps = props;
            delete boundProps.bounds;

            // binding properties
            propsBinder(self, boundProps);
        }).catch(function (error) {
            throw error;
        });
    },
    methods: {
        /**
         * Initialize the datatable and add the initial data.
         *
         * @link https://developers.google.com/chart/interactive/docs/reference#DataTable
         * @return object
         */
        buildDataTable: function buildDataTable() {

            var self = this;

            var dataTable = new google.visualization.DataTable();

            _.each(self.columns, function (value) {
                dataTable.addColumn(value);
            });

            if (!_.isEmpty(self.rows)) {
                dataTable.addRows(self.rows);
            }

            return dataTable;
        },
        /**
         * Update the datatable.
         *
         * @return void
         */
        updateDataTable: function updateDataTable() {

            var self = this;

            // Remove all data from the datatable.
            self.dataTable.removeRows(0, self.dataTable.getNumberOfRows());
            self.dataTable.removeColumns(0, self.dataTable.getNumberOfColumns());

            // Add
            _.each(self.columns, function (value) {
                self.dataTable.addColumn(value);
            });

            if (!_.isEmpty(self.rows)) {
                self.dataTable.addRows(self.rows);
            }
        },
        /**
         * Initialize the wrapper
         *
         * @link https://developers.google.com/chart/interactive/docs/reference#chartwrapper-class
         *
         * @return object
         */
        buildWrapper: function buildWrapper(chartType, dataTable, options, containerId) {

            var wrapper = new google.visualization.ChartWrapper({
                chartType: chartType,
                dataTable: dataTable,
                options: options,
                containerId: containerId
            });

            return wrapper;
        },
        /**
         * Build the chart.
         *
         * @return void
         */
        buildChart: function buildChart() {

            var self = this;

            // If dataTable isn't set, build it
            var dataTable = _.isEmpty(self.dataTable) ? self.buildDataTable() : self.dataTable;

            self.wrapper = self.buildWrapper(self.chartType, dataTable, self.options, self.chartId);

            // Set the datatable on this instance
            self.dataTable = self.wrapper.getDataTable();

            // After chart is built, set it on this instance
            google.visualization.events.addOneTimeListener(self.wrapper, 'ready', function () {
                self.chart = self.wrapper.getChart();
            });
        },
        /**
         * Draw the chart.
         *
         * @return void
         */
        drawChart: function drawChart() {

            var self = this;

            // We don't have any (usable) data, or we don't have columns. We can't draw a chart without those.
            if (!_.isEmpty(self.rows) && !_.isObjectLike(self.rows) || _.isEmpty(self.columns)) {
                return;
            }

            if (_.isNull(self.chart)) {
                // We haven't built the chart yet, so JUST. DO. IT!
                self.buildChart();
                
                // Dispatch an event listener to parent on selection change
                google.visualization.events.addListener(self.wrapper, 'select', function () {
                   self.$dispatch('select', self.wrapper.getChart().getSelection());
                });
            } else {
                // Chart already exists, just update the data
                self.updateDataTable();
            }

            // Chart has been built/Data has been updated, draw the chart.
            self.wrapper.draw();
        }
    }
};

function install(Vue) {
    var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    Vue.component('vue-chart', Chart);
}

module.exports = install;
