import cloudinary from 'cloudinary-core';
import mixin from 'utils/mixin';
import applyWithProps from 'utils/apply-with-props';
import { sliceAndUnsetProperties } from 'utils/slicing';
import { getCloudinaryInstanceOf } from 'utils/cloudinary';
import assign from 'utils/assign';
import { normalizeOptions, mergeTransformation, mergeCloudinaryConfig } from './common';
import Playlistable from './mixins/playlistable';
import VideoSource from './models/video-source';
import EventHandlerRegistry from './event-handler-registry';

const DEFAULT_PARAMS = {
  transformation: {},
  sourceTypes: [],
  sourceTransformation: [],
  posterOptions: {}
};

export const CONSTRUCTOR_PARAMS = ['cloudinaryConfig', 'transformation',
  'sourceTypes', 'sourceTransformation', 'posterOptions', 'autoShowRecommendations'];

class CloudinaryContext extends mixin(Playlistable) {
  constructor(player, options = {}) {
    super(player, options);

    this.player = player;
    options = assign({}, DEFAULT_PARAMS, options);

    let _source = null;
    let _lastSource = null;
    let _lastPlaylist = null;
    let _posterOptions = null;
    let _cloudinaryConfig = null;
    let _transformation = null;
    let _sourceTypes = null;
    let _sourceTransformation = null;
    let _chainTarget = options.chainTarget;
    let _playerEvents = null;
    let _recommendations = null;
    let _autoShowRecommendations = false;

    // source("oceans")
    // source("oceans", { transformation: { width: 50, height: 100, crop: 'limit' } })
    // source({ publicId: 'oceans', transformation: { width: 50, height: 100, crop: 'limit' } })
    // source({ publicId: 'oceans', transformation: { width: 50, height: 100, crop: 'limit' },
    //   recommendations: [{ publicId: 'book', info: { title: 'book', subtitle: 'book subtitle', description: 'lorem ipsum' } }]
    //   OR  recommendations: (done) => done([{ publicId: 'book', info: { title: 'book', subtitle: 'book subtitle', description: 'lorem ipsum' } }]) })
    //   OR  recommendations: Promise.resolve([{ publicId: 'book', info: { title: 'book', subtitle: 'book subtitle', description: 'lorem ipsum' } }]) })
    // })
    this.source = (source, options = {}) => {
      options = assign({}, options);

      if (!source) {
        return _source;
      }

      let src = null;

      if (source instanceof VideoSource) {
        src = source;
      } else {
        let { publicId, options: _options } = normalizeOptions(source, options);
        src = this.buildSource(publicId, _options);
      }

      if (src.recommendations()) {
        const recommendations = src.recommendations();

        let itemBuilder = null;
        let disableAutoShow = false;

        if (options.recommendationOptions) {
          ({ disableAutoShow, itemBuilder } = sliceAndUnsetProperties(options.recommendationOptions, 'disableAutoShow', 'itemBuilder'));
        }
        setRecommendations(recommendations, { disableAutoShow, itemBuilder });
      } else {
        unsetRecommendations();
      }

      _source = src;
      if (!options.skipRefresh) {
        refresh();
      }

      this.player.trigger('cldsourcechanged', { source: src });

      return _chainTarget;
    };

    this.buildSource = (publicId, options = {}) => {
      ({ publicId, options } = normalizeOptions(publicId, options));

      options.cloudinaryConfig = mergeCloudinaryConfig(this.cloudinaryConfig(), options.cloudinaryConfig || {});
      options.transformation = mergeTransformation(this.transformation(), options.transformation || {});
      options.sourceTransformation = options.sourceTransformation || this.sourceTransformation();
      options.sourceTypes = options.sourceTypes || this.sourceTypes();
      options.poster = options.poster || posterOptionsForCurrent();
      options.queryParams = options.usageReport ? { _s: `vp-${VERSION}` } : {};

      const video = new VideoSource(publicId, options);

      return video;
    };

    this.posterOptions = (options) => {
      if (!options) {
        return _posterOptions;
      }

      _posterOptions = options;

      return _chainTarget;
    };

    this.cloudinaryConfig = (config) => {
      if (!config) {
        return _cloudinaryConfig;
      }

      _cloudinaryConfig = getCloudinaryInstanceOf(cloudinary.Cloudinary, config);

      return _chainTarget;
    };

    this.transformation = (trans) => {
      if (!trans) {
        return _transformation;
      }

      _transformation = getCloudinaryInstanceOf(cloudinary.Transformation, trans);

      return _chainTarget;
    };

    this.sourceTypes = (types) => {
      if (!types) {
        return _sourceTypes;
      }

      _sourceTypes = types;

      return _chainTarget;
    };

    this.sourceTransformation = (trans) => {
      if (!trans) {
        return _sourceTransformation;
      }

      _sourceTransformation = trans;

      return _chainTarget;
    };

    this.on = (...args) => _playerEvents.on(...args);
    this.one = (...args) => _playerEvents.one(...args);
    this.off = (...args) => _playerEvents.off(...args);

    this.autoShowRecommendations = (autoShow) => {
      if (autoShow === undefined) {
        return _autoShowRecommendations;
      }

      _autoShowRecommendations = autoShow;

      return _chainTarget;
    };

    this.dispose = () => {
      if (this.playlist()) {
        this.disposePlaylist();
      }
      unsetRecommendations();
      _source = undefined;
      _playerEvents.removeAllListeners();
    };

    const setRecommendations = (recommendations, { disableAutoShow = false, itemBuilder = null }) => {
      unsetRecommendations();

      if (!Array.isArray(recommendations) && typeof recommendations !== 'function' && !recommendations.then) {
        throw new Error('"recommendations" must be either an array or a function');
      }

      _recommendations = {};

      itemBuilder = itemBuilder || ((source) => ({ source: source instanceof VideoSource ? source : this.buildSource(source), action: () => this.source(source) }));

      _recommendations.sourceChangedHandler = () => {
        const trigger = (sources) => {
          if (sources.length > 0) {
            const items = sources.map((_source) => itemBuilder(_source));
            this.player.trigger('recommendationschanged', { items });
          }
          _recommendations.sources = sources;
        };

        if (typeof recommendations === 'function') {
          trigger(recommendations());
        } else if (recommendations.then) {
          recommendations.then(trigger);
        } else {
          trigger(recommendations);
        }
      };

      this.one('sourcechanged', _recommendations.sourceChangedHandler);

      _recommendations.endedHandler = () => {
        if (!disableAutoShow && this.autoShowRecommendations()) {
          this.player.trigger('recommendationsshow');
        }
      };

      this.on('ended', _recommendations.endedHandler);
    };

    const unsetRecommendations = () => {
      if (_recommendations) {
        this.off('sourcechanged', _recommendations.sourceChangedHandler);
        this.off('ended', _recommendations.endedHandler);
        delete _recommendations.endedHandler;
        delete _recommendations.sourceChangedHandler;
      }

      _recommendations = null;
    };

    const refresh = () => {
      const src = this.source();
      if (src.poster()) {
        this.player.poster(src.poster().url());
      }

      this.player.src(src.generateSources());

      _lastSource = src;
      _lastPlaylist = this.playlist();
    };

    const posterOptionsForCurrent = () => {
      const opts = assign({}, this.posterOptions());

      opts.transformation = getCloudinaryInstanceOf(cloudinary.Transformation, opts.transformation || {});
      if (this.player.width() > 0 && this.player.height() > 0) {
        opts.transformation.width(this.player.width()).height(this.player.height()).crop('limit');
      }

      return opts;
    };

    // Handle external (non-cloudinary plugin) source changes (e.g. by ad plugins)
    const syncState = () => {
      let src = this.player.currentSource();

      // When source is cloudinary's
      if (_lastSource.contains(src)) {
        // If plugin state doesn't have an active VideoSource
        if (!this.source()) {
          // We might have been running a playlist, reset playlist's state.
          if (_lastPlaylist) {
            this.playlist(_lastPlaylist);
          }
          // Rebuild last source state without calling vjs's 'src' and 'poster'
          this.source(_lastSource, { skipRefresh: true });
        }
      } else {
        // Used by cloudinary-only components
        this.player.trigger('cldsourcechanged', {});

        // When source isn't cloudinary's - reset the plugin's state.
        this.dispose();
      }
    };

    _playerEvents = new EventHandlerRegistry(this.player);

    const constructorParams = sliceAndUnsetProperties(options, ...CONSTRUCTOR_PARAMS);

    applyWithProps(this, constructorParams);

    this.on('sourcechanged', syncState);
  }

  currentPublicId() {
    return this.source() && this.source().publicId();
  }

  currentPoster() {
    return this.source() && this.source().poster();
  }
}

export default function(options = {}) {
  options.chainTarget = options.chainTarget || this;
  this.cloudinary = new CloudinaryContext(this, options);
}
