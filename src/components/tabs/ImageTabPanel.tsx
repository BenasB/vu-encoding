import {
  Alert,
  AlertIcon,
  FormControl,
  FormErrorMessage,
  Image,
  Input,
  InputGroup,
  InputLeftAddon,
  VStack,
} from '@chakra-ui/react';
import React, { useEffect, useMemo, useState } from 'react';
import { ValidatedInputValue, BinaryString } from '../../utils/types';
import { readFileAsArrayBuffer } from '../../utils/file-utils';
import {
  arrayBufferToBinaryString,
  binaryStringToArrayBuffer,
  createBinaryString,
} from '../../utils/type-utils';
import { decode as bmpDecode } from 'bmp-js';
import passThroughChannel from '../../logic/channel';
import { useGetParameterInput } from '../../state/ParameterInputContext';
import { reedMullerEncode } from '../../logic/encoding/rmEncoding';
import { reedMullerDecode } from '../../logic/decoding/rmDecoding';

const BYTE_SIZE = 8;

const ImageTabPanel: React.FC = () => {
  const { pe, n, controlMatrices, generationMatrix } = useGetParameterInput();

  const [imageInput, setImageInput] = useState<File | undefined>(undefined);
  const handleOnImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.item(0);
    setImageInput(file ?? undefined);
  };

  const [v, setV] = useState<ValidatedInputValue<BinaryString>>({
    status: 'pending',
    input: '',
  });

  const [beforeImage, setBeforeImage] = useState<
    { data: Buffer; header: Buffer } | undefined
  >(undefined);

  useEffect(() => {
    const startImageLoad = async () => {
      if (imageInput === undefined) return;
      setBeforeImage(undefined);
      setV({
        status: 'pending',
        input: '',
      });
      const arrayBuffer = await readFileAsArrayBuffer(imageInput);
      if (!ignore) {
        const fullBuffer = Buffer.from(arrayBuffer);
        const bmpFile = bmpDecode(fullBuffer);
        const bmpHeader = fullBuffer.subarray(0, bmpFile.offset);
        const bmpData = fullBuffer.subarray(bmpFile.offset);
        setBeforeImage({
          header: bmpHeader,
          data: bmpData,
        });
        const binaryString = arrayBufferToBinaryString(bmpData, BYTE_SIZE);
        setV({
          status: 'success',
          input: binaryString,
          validValue: binaryString,
        });
      }
    };

    let ignore = false;
    startImageLoad().catch(err => console.log('Error in image load', err));
    return () => {
      ignore = true;
    };
  }, [imageInput]);

  const padding = useMemo<number | undefined>(
    () =>
      v.status === 'success' && n.status === 'success'
        ? (n.validValue + 1 - (v.validValue.length % (n.validValue + 1))) %
          (n.validValue + 1)
        : undefined,
    [v, n],
  );

  const c = useMemo<ValidatedInputValue<BinaryString>>(() => {
    if (
      v.status !== 'success' ||
      n.status !== 'success' ||
      generationMatrix === undefined ||
      padding === undefined
    )
      return { status: 'pending', input: '' };

    try {
      const timeBefore = new Date();
      const encodedValue = reedMullerEncode(
        createBinaryString(
          v.validValue.padEnd(v.validValue.length + padding, '0'),
        ),
        n.validValue,
        generationMatrix,
      );
      console.log(
        `Encoding took: ${new Date().getTime() - timeBefore.getTime()} ms`,
      );
      return {
        status: 'success',
        input: encodedValue,
        validValue: encodedValue,
      };
    } catch (err) {
      if (err instanceof Error) {
        return {
          status: 'fail',
          input: '',
          message: err.message,
        };
      }

      return {
        status: 'fail',
        input: '',
        message: 'Ran into a problem while decoding',
      };
    }
  }, [v, n, generationMatrix, padding]);

  const y = useMemo<ValidatedInputValue<BinaryString>>(() => {
    if (pe.status !== 'success' || c.status !== 'success') {
      return {
        status: 'pending',
        input: '',
      };
    }

    const newY = passThroughChannel(c.validValue, pe.validValue);
    return {
      status: 'success',
      input: newY,
      validValue: newY,
    };
  }, [pe, c]);

  const vPrime = useMemo<ValidatedInputValue<BinaryString>>(() => {
    if (
      y.status !== 'success' ||
      n.status !== 'success' ||
      controlMatrices === undefined
    ) {
      return {
        status: 'pending',
        input: '',
      };
    }

    try {
      const timeBefore = new Date();
      const decodedValue = reedMullerDecode(
        y.validValue,
        controlMatrices,
        n.validValue,
      );
      console.log(
        `Decoding took: ${new Date().getTime() - timeBefore.getTime()} ms`,
      );
      return {
        status: 'success',
        input: decodedValue,
        validValue: decodedValue,
      };
    } catch (err) {
      if (err instanceof Error) {
        return {
          status: 'fail',
          input: '',
          message: err.message,
        };
      }

      return {
        status: 'fail',
        input: '',
        message: 'Ran into a problem while decoding',
      };
    }
  }, [y, n, controlMatrices]);

  const afterImage = useMemo<ValidatedInputValue<string>>(() => {
    if (
      vPrime.status !== 'success' ||
      beforeImage === undefined ||
      padding === undefined
    )
      return {
        status: 'pending',
        input: '',
      };

    try {
      const base64Buffer = Buffer.concat([
        beforeImage.header,
        Buffer.from(
          binaryStringToArrayBuffer(
            createBinaryString(
              vPrime.validValue.substring(
                0,
                vPrime.validValue.length - padding,
              ),
            ),
            BYTE_SIZE,
          ),
        ),
      ]).toString('base64');

      return {
        status: 'success',
        input: base64Buffer,
        validValue: base64Buffer,
      };
    } catch (err) {
      if (err instanceof Error) {
        return {
          status: 'fail',
          input: '',
          message: err.message,
        };
      }

      return {
        status: 'fail',
        input: '',
        message: 'Ran into a problem while converting m prime to image',
      };
    }
  }, [vPrime, beforeImage, padding]);

  const uncodedAfterImage = useMemo<ValidatedInputValue<string>>(() => {
    if (
      pe.status !== 'success' ||
      v.status !== 'success' ||
      beforeImage === undefined
    ) {
      return {
        status: 'pending',
        input: '',
      };
    }

    const vPrimeUncoded = passThroughChannel(v.validValue, pe.validValue);

    try {
      const base64Buffer = Buffer.concat([
        beforeImage.header,
        Buffer.from(binaryStringToArrayBuffer(vPrimeUncoded, BYTE_SIZE)),
      ]).toString('base64');
      return {
        status: 'success',
        input: base64Buffer,
        validValue: base64Buffer,
      };
    } catch (err) {
      if (err instanceof Error) {
        return {
          status: 'fail',
          input: '',
          message: err.message,
        };
      }

      return {
        status: 'fail',
        input: '',
        message: 'Ran into a problem while converting m prime to text',
      };
    }
  }, [pe, v, beforeImage]);

  return (
    <VStack spacing={4}>
      <FormControl>
        <InputGroup>
          <InputLeftAddon>Input</InputLeftAddon>
          <Input
            type="file"
            accept="image/*"
            onChange={handleOnImageInputChange}
            sx={{
              '::file-selector-button': {
                display: 'none',
              },
            }}
            lineHeight={'35px'}
          />
        </InputGroup>
      </FormControl>
      {beforeImage && (
        <FormControl>
          <InputGroup alignItems={'stretch'}>
            <InputLeftAddon height={'auto'}>Input</InputLeftAddon>
            <Image
              src={`data:image/*;base64,${Buffer.concat([
                beforeImage.header,
                beforeImage.data,
              ]).toString('base64')}`}
              alignSelf={'start'}
            />
          </InputGroup>
        </FormControl>
      )}
      {v.status === 'fail' && (
        <Alert status="error">
          <AlertIcon />
          {v.message}
        </Alert>
      )}
      {c.status === 'fail' && (
        <Alert status="error">
          <AlertIcon />
          {c.message}
        </Alert>
      )}
      {y.status === 'fail' && (
        <Alert status="error">
          <AlertIcon />
          {y.message}
        </Alert>
      )}
      {vPrime.status === 'fail' && (
        <Alert status="error">
          <AlertIcon />
          {vPrime.message}
        </Alert>
      )}
      {beforeImage && (
        <FormControl isInvalid={uncodedAfterImage.status === 'fail'}>
          <InputGroup alignItems={'stretch'}>
            <InputLeftAddon height={'auto'}>
              Output
              <br />
              (uncoded)
            </InputLeftAddon>
            {uncodedAfterImage.status === 'success' && (
              <Image
                src={`data:image/*;base64,${uncodedAfterImage.validValue}`}
                alignSelf={'start'}
              />
            )}
          </InputGroup>
          {uncodedAfterImage.status === 'fail' && (
            <FormErrorMessage>{uncodedAfterImage.message}</FormErrorMessage>
          )}
        </FormControl>
      )}
      {beforeImage && (
        <FormControl isInvalid={afterImage.status === 'fail'}>
          <InputGroup alignItems={'stretch'}>
            <InputLeftAddon height={'auto'}>Output</InputLeftAddon>
            {afterImage.status === 'success' && (
              <Image
                src={`data:image/*;base64,${afterImage.validValue}`}
                alignSelf={'start'}
              />
            )}
          </InputGroup>
          {afterImage.status === 'fail' && (
            <FormErrorMessage>{afterImage.message}</FormErrorMessage>
          )}
        </FormControl>
      )}
    </VStack>
  );
};

export default ImageTabPanel;
